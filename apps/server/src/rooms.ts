import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import type { Role } from '@storyboard/core';
import { newId, roomCode } from './tokens';
import type { KalicilikTuru, OdaDeposu } from './kalicilik';

export interface Invite {
  tokenId: string;
  token: string;
  role: Role;
  expiresAt: number;
  revoked: boolean;
  usedBy: string | null;
  label?: string;
  /**
   * Daveti kaç KEZ kullanmaya izin var. Varsayılan 1.
   *
   * NEDEN SINIR: jeton adres satırında taşınıyor (`?davet=…`). Adres tarayıcı
   * geçmişine, sekme paylaşımına, vekil günlüğüne düşer — yani jeton er geç
   * bir yerde YAZILI kalır. Kullanım sınırı, sızan bir jetonun İŞE YARAMA
   * penceresini kapatıyor: davetli bir kez girdikten sonra aynı bağlantıyla
   * kimse giremez. Sahip birden çok kişiyi tek bağlantıyla çağırmak isterse
   * sınırı AÇIKÇA yükseltir; sessiz bir varsayılan olarak açık bırakılmaz.
   */
  kullanimSiniri: number;
  kullanim: number;
  /**
   * Davet BELİRLİ bir hesaba bağlıysa o hesabın e-postası.
   *
   * Bağlıysa "jetonu olan girer" değil "davet edilen KULLANICI girer" olur:
   * jeton çalınsa bile başka bir hesapla kullanılamaz.
   */
  eposta?: string | null;
}

export interface RoomUser {
  userId: string;
  name: string;
  role: Role;
  online: boolean;
  /** Oda üyeliği bir hesaba bağlıysa hesabın kimliği. */
  hesapId?: string;
  eposta?: string;
}

export interface Connection {
  socket: WebSocket;
  userId: string;
  role: Role;
  name: string;
}

export interface Room {
  id: string;
  code: string;
  projectName: string;
  ownerTokenId: string;
  doc: Y.Doc;
  awareness: Awareness;
  invites: Map<string, Invite>;
  users: Map<string, RoomUser>;
  connections: Set<Connection>;
  createdAt: number;
  /** Son bağlantının düştüğü an — boşta kalma süresi buradan ölçülür. */
  idleSince: number;
  closed: boolean;
}

const rooms = new Map<string, Room>();
const codeIndex = new Map<string, string>();

/**
 * Kalıcılık katmanı — bağlıysa odalar diskte yaşar, değilse yalnız bellekte.
 *
 * Modül düzeyinde: `rooms`/`codeIndex` de öyle. Odanın kaydı ile kaydının
 * diske düşmesi AYNI kurala ait; ikisini ayrı yerlere koymak "oda kuruldu ama
 * yazılmadı" boşluğunu açardı.
 */
let depo: OdaDeposu | null = null;
let tur: KalicilikTuru | null = null;

export function kalicilikKur(d: OdaDeposu | null, t: KalicilikTuru | null): void {
  depo = d;
  tur = t;
}

export function kalicilikDeposu(): OdaDeposu | null {
  return depo;
}

/** Odanın o anki hâlini HEMEN diske yazar. Kapanış ve kritik anlar için. */
export function odayiYaz(room: Room): void {
  tur?.odaYaz(room, true);
}

export function createRoom(projectName: string, ownerTokenId: string): Room {
  const id = newId('room');
  let code = roomCode();
  /* Kod çakışması BELLEKTEKİ odalara değil, DİSKTEKİLERE de bakar: tembel
     yüklemede boşta kalmış bir oda bellekte olmayabilir ve aynı kod ikinci
     kez üretilseydi kod dizini eski odayı gölgeleyip erişilemez kılardı. */
  while (codeIndex.has(code) || depo?.dizin().has(code)) code = roomCode();

  const room = kur({
    id,
    code,
    projectName,
    ownerTokenId,
    createdAt: Date.now(),
    users: [],
    invites: [],
  }, null);
  /* Oda kurulur kurulmaz yazılır: turu beklemek, ilk iki saniyede yeniden
     başlayan bir sunucuda odayı kaydı hiç oluşmadan kaybettirirdi. */
  odayiYaz(room);
  return room;
}

/** Kayıt + (varsa) belge → bellekteki oda. Hem yeni oda hem diriltme yolu. */
function kur(
  kayit: {
    id: string;
    code: string;
    projectName: string;
    ownerTokenId: string;
    createdAt: number;
    users: RoomUser[];
    invites: Invite[];
  },
  doc: Y.Doc | null,
): Room {
  const belge = doc ?? new Y.Doc();
  const room: Room = {
    id: kayit.id,
    code: kayit.code,
    projectName: kayit.projectName,
    ownerTokenId: kayit.ownerTokenId,
    doc: belge,
    awareness: new Awareness(belge),
    invites: new Map(kayit.invites.map((i) => [i.tokenId, i])),
    users: new Map(kayit.users.map((u) => [u.userId, { ...u, online: false }])),
    connections: new Set(),
    createdAt: kayit.createdAt,
    idleSince: Date.now(),
    closed: false,
  };
  rooms.set(room.id, room);
  codeIndex.set(room.code, room.id);
  return room;
}

/**
 * Diskteki odayı belleğe geri getirir.
 *
 * Boşta kalan odalar bellekten DÜŞÜRÜLÜYOR (`sweepRooms`) ama dosyaları
 * duruyor. Diriltme olmasaydı davetlisi altı saat sonra dönen bir ekip
 * "oda bulunamadı" görürdü — veri diskte dururken erişilemez olması,
 * kullanıcı için kayıptan farksızdır.
 */
function dirilt(id: string): Room | undefined {
  if (!depo) return undefined;
  const okuma = depo.oku(id);
  if (!okuma) return undefined;
  return kur(okuma.kayit, okuma.doc);
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id) ?? dirilt(id);
}

export function getRoomByCode(code: string): Room | undefined {
  const kod = code.toUpperCase().trim();
  const bellekte = codeIndex.get(kod);
  if (bellekte) return rooms.get(bellekte);
  const diskte = depo?.dizin().get(kod);
  return diskte ? dirilt(diskte) : undefined;
}

/**
 * Odayı bellekten düşürür.
 *
 * `niyet`:
 * - `'bosalt'` (varsayılan) — son hâli diske yazılır, dosyalar KALIR. Boşta
 *   kalma temizliği ve sunucu kapanışı bu yolu kullanır: bellek serbest
 *   kalır, iş kaybolmaz.
 * - `'arsivle'` — sahibin "oturumu kapat" isteği. Dosyalar SİLİNMEZ,
 *   `silinen/` altına taşınır (§15.3).
 */
export function closeRoom(id: string, niyet: 'bosalt' | 'arsivle' = 'bosalt'): void {
  const room = rooms.get(id);
  if (!room) {
    if (niyet === 'arsivle') depo?.arsivle(id);
    return;
  }
  /* Yazım BELGE YOK EDİLMEDEN ÖNCE.
     ÖLÇÜLDÜ (mutasyon M8, 2026-08-26): bugünkü Yjs'te `doc.destroy()` öğe
     deposunu BOŞALTMIYOR, `encodeStateAsUpdate` sonrasında da tam durumu
     veriyor — yani sıra bugün gözlenebilir bir fark yaratmıyor ve o mutant
     eşdeğer çıktı. Sıra yine de böyle: yok edilmiş bir nesneden veri
     okumanın çalışması Yjs'in BELGELENMEMİŞ bir ayrıntısı ve veri
     güvenliğinin en son adımı ona dayandırılamaz. */
  if (niyet === 'bosalt') odayiYaz(room);
  room.closed = true;
  for (const conn of room.connections) {
    try {
      conn.socket.close(4001, 'Oturum kapatıldı');
    } catch {
      /* zaten kapalı */
    }
  }
  room.awareness.destroy();
  room.doc.destroy();
  codeIndex.delete(room.code);
  rooms.delete(id);
  tur?.unut(id);
  if (niyet === 'arsivle') depo?.arsivle(id);
}

export function listRooms(): Room[] {
  return [...rooms.values()];
}

/**
 * Boş ve boşta kalmış odaları BELLEKTEN düşürür.
 *
 * Kalıcılık bağlıyken bu bir SİLME değil boşaltmadır: oda son hâliyle diske
 * yazılır, dosyaları kalır ve kodu ilk istendiğinde geri diriltilir. Eskiden
 * gerçekten siliyordu — kalıcılık öncesinde "altı saat kimse girmediyse iş de
 * gitsin" demekti ve kullanıcının tek bağlayıcı isteğiyle ("dosyalar
 * kaybolmasın") doğrudan çelişiyordu.
 *
 * Ölçüt `createdAt` değil `idleSince`: oluşturulma anına bakmak, uzun süredir
 * açık bir odayı son bağlantı bir anlık ağ kesintisiyle düştüğünde dokümanıyla
 * birlikte siliyordu.
 */
export function sweepRooms(maxIdleMs: number): number {
  let removed = 0;
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.connections.size === 0 && now - room.idleSince > maxIdleMs) {
      closeRoom(room.id);
      removed++;
    }
  }
  return removed;
}

/** Bağlantı sayısı değiştiğinde boşta kalma sayacını günceller. */
export function touchRoomActivity(room: Room): void {
  room.idleSince = Date.now();
}
