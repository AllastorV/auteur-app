import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import crypto from 'node:crypto';
import type { Role } from '@storyboard/core/model/types';
import { ROLES } from '@storyboard/core/model/permissions';
import { newId, sign, verify, type TokenPayload } from './tokens';
import {
  closeRoom,
  createRoom,
  getRoom,
  getRoomByCode,
  kalicilikKur,
  listRooms,
  sweepRooms,
  type Connection,
  type Room,
} from './rooms';
import { applyRoleChange, setupConnection } from './sync';
import {
  dizinKur,
  KalicilikTuru,
  KAYIT_ARALIK_MS,
  odaDeposu,
  varsayilanVeriDizini,
  veriDiziniSina,
} from './kalicilik';
import { tlsMalzemesi, TLS_YOK_UYARISI, type TlsMalzemesi } from './tls';
import {
  epostaNormalle,
  hesapDeposu,
  parolaDogruMu,
  parolaGecerliMi,
  sahteDogrulama,
  PAROLA_EN_AZ,
  PAROLA_EN_COK,
  type Hesap,
  type HesapDeposu,
} from './hesaplar';
import {
  bagSinirlayici,
  hizSinirlayici,
  istemciAdresi,
  GUVENLIK_BASLIKLARI,
  type HizSinirlayici,
} from './guvenlik';

export interface ServerOptions {
  port?: number;
  host?: string;
  secret?: string;
  /** Davet linklerinin yönlendireceği web istemcisi adresi */
  webAppUrl?: string;
  /** Boş odaların temizlenme süresi (ms) */
  roomIdleMs?: number;
  /** İzin verilen tarayıcı kaynakları. Varsayılan: web istemcisinin adresi. */
  allowedOrigins?: string[] | true;
  /** Tek WebSocket mesajı için üst sınır (bayt) */
  maxMessageBytes?: number;
  /** Oda dosyalarının kökü. Varsayılan: `STORYBOARD_DATA_DIR` ya da ev dizini. */
  dataDir?: string;
  /** Diske yazma turunun aralığı (ms). Varsayılan `KAYIT_ARALIK_MS`. */
  kayitAralikMs?: number;
  /**
   * TLS malzemesi. Verilmezse ortamdan okunur (`STORYBOARD_TLS_CERT/KEY`);
   * `null` verilirse ortam okunmaz ve TLS kapalı kalır (test yolu).
   */
  tls?: TlsMalzemesi | null;
  /**
   * Oturum açmak ve odaya katılmak için HESAP zorunlu mu?
   *
   * `false` (varsayılan) → bugünkü davranış: davet jetonu olan girer.
   * `true` → yalnız kimliği doğrulanmış hesaplar oda açabilir ve katılabilir.
   * Ortam değişkeni: `STORYBOARD_HESAP_ZORUNLU=1`.
   */
  hesapZorunlu?: boolean;
  /** Oda oturum jetonunun ömrü (dakika). `STORYBOARD_OTURUM_DK`. */
  oturumDakika?: number;
  /** Ters vekil arkasındaysa `x-forwarded-for` okunsun mu? Varsayılan HAYIR. */
  vekilGuvenilir?: boolean;
  /** Tek istemci adresinden açılabilecek en çok WebSocket sayısı. */
  enCokBaglanti?: number;
  /** Hız sınırı ayarları — testlerin gerçek saat beklemeden ölçebilmesi için. */
  hizSinirlari?: Partial<Record<HizKapisiAdi, { limit: number; pencereMs: number }>>;
  logger?: boolean;
}

/** Hız sınırı uygulanan uçlar. */
export type HizKapisiAdi = 'kayit' | 'giris' | 'yenile' | 'oturumAc' | 'davet' | 'katil';

/**
 * Varsayılan hız sınırları.
 *
 * `giris` en dar olan: parola denemesi buradan geçiyor ve kaba kuvvetin tek
 * gerçek engeli bu sayaç. Dakikada 5 deneme, 8 karakterlik bir parolayı
 * denemek için insan ömrünün ötesinde süre demek. `kayit` dar çünkü her kayıt
 * bir scrypt (~16 MB, onlarca ms) yakıyor — sınırsız kayıt bir bellek/CPU
 * saldırısıdır.
 */
export const VARSAYILAN_HIZ: Record<HizKapisiAdi, { limit: number; pencereMs: number }> = {
  kayit: { limit: 5, pencereMs: 15 * 60_000 },
  giris: { limit: 5, pencereMs: 60_000 },
  yenile: { limit: 30, pencereMs: 60_000 },
  oturumAc: { limit: 20, pencereMs: 60_000 },
  /* `davet` ve `katil` daha geniş: bir sınıf ya da ekip TEK bir NAT'ın
     arkasından katılabilir ve sayaç ADRES başına. Dar bir sınır burada
     saldırganı değil kalabalık bir ekibi durdururdu. Kaba kuvvetin gerçek
     kapısı `giris`; bu ikisi otomasyona karşı üst sınır. */
  davet: { limit: 30, pencereMs: 60_000 },
  katil: { limit: 30, pencereMs: 60_000 },
};

export interface RunningServer {
  fastify: FastifyInstance;
  wss: WebSocketServer;
  port: number;
  url: string;
  wsUrl: string;
  /** Hesap deposu — testler saklanan kaydı doğrudan denetleyebilsin diye. */
  hesaplar: HesapDeposu;
  /** Trafik şifreli mi — sunucu TLS'i kendisi sonlandırıyor mu. */
  tls: boolean;
  /** Oda dosyalarının kökü. */
  dataDir: string;
  close(): Promise<void>;
}

const DEFAULT_INVITE_MINUTES = 24 * 60;
/**
 * Yol parametrelerinin biçimi.
 *
 * Kimlikler `newId` ile üretiliyor: önek + base64url. Deseni burada zorlamak
 * doğrulanmamış bir dizgenin uygulamanın derinlerine (Yjs anahtarı, dosya
 * adı, günlük satırı) ulaşmasını güven sınırında kesiyor — `gunlukDeposu`'nun
 * proje kimliği için yaptığının HTTP karşılığı.
 */
const KIMLIK = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' } as const;
const ODA_PARAM = {
  type: 'object',
  required: ['roomId'],
  properties: { roomId: KIMLIK },
} as const;

/** Hesabın erişim jetonu KISA ÖMÜRLÜ: çalınırsa penceresi dar olsun. */
const HESAP_ERISIM_MS = 15 * 60_000;
/** Yenileme jetonu uzun ömürlü ama TEK KULLANIMLIK (kullanınca döndürülür). */
const HESAP_YENILEME_MS = 30 * 24 * 60 * 60_000;

function bearer(header?: string): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const secret = options.secret ?? process.env.STORYBOARD_SECRET ?? crypto.randomBytes(32).toString('hex');
  const port = options.port ?? Number(process.env.PORT ?? 5180);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  /* Yapılandırılmış web adresi — VARSAYILAN YOK. Sabit `localhost:5174`
     yazılıyordu ve davet linkleri aynı makine dışında hiç çalışmıyordu
     (kullanıcı bildirimi 2026-08-26). Verilmediğinde adres artık isteğin
     HOST başlığından türetiliyor (`publicWebUrl`). */
  const webAppUrl = options.webAppUrl ?? process.env.STORYBOARD_WEB_URL;
  const WEB_PORT = 5174;
  /* Uygulamanın çalıştığı portlar — üretim derlemesi ve geliştirme sunucusu. */
  const UYGULAMA_PORTLARI = [WEB_PORT, 5173];

  const hesapZorunlu =
    options.hesapZorunlu ?? ['1', 'true', 'evet'].includes((process.env.STORYBOARD_HESAP_ZORUNLU ?? '').toLowerCase());
  const oturumDakika = Math.min(
    Math.max(options.oturumDakika ?? Number(process.env.STORYBOARD_OTURUM_DK ?? 12 * 60), 1),
    60 * 24 * 30,
  );
  const vekilGuvenilir =
    options.vekilGuvenilir ?? ['1', 'true', 'evet'].includes((process.env.STORYBOARD_VEKIL_GUVENILIR ?? '').toLowerCase());
  const enCokBaglanti = options.enCokBaglanti ?? Number(process.env.STORYBOARD_ENCOK_BAGLANTI ?? 20);

  const hesaplar = hesapDeposu();
  const baglantilar = bagSinirlayici(enCokBaglanti);
  const hizlar = {} as Record<HizKapisiAdi, HizSinirlayici>;
  /* Hız sınırı ÇARPANI — otomatik testler için.
     ÖLÇÜLDÜ: e2e paketi tek koşuda onlarca oda ve davet üretiyor; üretim
     sınırları o yükte devreye girip testleri boğuyordu (tek başına geçen
     dosya, tam koşuda düşüyor). Sınırı KALDIRMAK yanlış olurdu — o zaman
     sınırın kendisi hiç ölçülmezdi; testler için ÇARPILIYOR ve güvenlik
     testleri kendi sıkı sınırlarını `options.hizSinirlari` ile veriyor. */
  const hizCarpani = Math.max(1, Number(process.env.STORYBOARD_HIZ_CARPANI ?? 1));
  for (const ad of Object.keys(VARSAYILAN_HIZ) as HizKapisiAdi[]) {
    const a = options.hizSinirlari?.[ad] ?? VARSAYILAN_HIZ[ad];
    const limit = options.hizSinirlari?.[ad] ? a.limit : a.limit * hizCarpani;
    hizlar[ad] = hizSinirlayici(limit, a.pencereMs);
  }

  /* Gövde üst sınırı: doğrulamadan ÖNCE gelen bayt miktarını sınırlar.
     Şema doğrulaması ancak gövde okunduktan sonra çalışır; sınırsız gövde
     kabul etmek, hiçbir alanı geçerli olmayan bir isteğin bile sunucu
     belleğini şişirebilmesi demektir. REST uçlarının en büyüğü bir davet
     etiketi; 64 KB fazlasıyla yeter. (WebSocket'in kendi sınırı ayrı.) */
  /* ---------------------------- kalıcılık ---------------------------- */

  /* Veri dizini ÖNCE sınanıyor: kalıcılığı olmayan bir ortak çalışma sunucusu
     kullanıcıya yalan söyler — herkes yazar, yeniden başlatma her şeyi siler.
     Bu yüzden açılamıyorsa sunucu HİÇ AÇILMIYOR (§15.4). */
  const dataDir = options.dataDir ?? varsayilanVeriDizini();
  try {
    veriDiziniSina(dataDir);
  } catch (err) {
    throw new Error(
      `Veri dizini yazılabilir değil (${dataDir}): ` +
        `${err instanceof Error ? err.message : String(err)}\
` +
        'Kalıcılık olmadan sunucu açılmaz: yeniden başlatma bütün oda ' +
        'içeriğini silerdi. STORYBOARD_DATA_DIR ile yazılabilir bir yol verin.',
    );
  }
  const depo = odaDeposu(dataDir);
  const kalicilik = new KalicilikTuru(
    depo,
    listRooms,
    options.kayitAralikMs ?? Number(process.env.STORYBOARD_KAYIT_MS ?? KAYIT_ARALIK_MS),
  );
  kalicilikKur(depo, kalicilik);
  const diskteki = dizinKur(depo);
  if (diskteki > 0) console.log(`[kalicilik] ${diskteki} oda diskte bulundu (${dataDir}).`);
  kalicilik.baslat();

  /* ------------------------------- TLS ------------------------------- */

  /* `undefined` → ortamdan oku; `null` → açıkça kapalı (test yolu). */
  const tls = options.tls === undefined ? tlsMalzemesi() : options.tls;
  if (!tls) console.warn(TLS_YOK_UYARISI);

  /* Gövde sınırı (güvenlik) ve TLS (kalıcılık ajanı) BİRLİKTE: ikisi de aynı
     Fastify örneğinde yaşamak zorunda. */
  const fastify = (
    tls
      ? Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024,
                  https: { cert: tls.cert, key: tls.key } })
      : Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 })
  ) as FastifyInstance;

  /* Güvenlik başlıkları TEK YERDE — uç başına eklenseydi yeni bir uç
     eklendiğinde unutulur ve eksiklik sessiz kalırdı. */
  fastify.addHook('onSend', async (_req, reply, payload) => {
    for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) reply.header(ad, deger);
    return payload;
  });

  /** Hız sınırı kapısı — uç tanımında `onRequest` olarak bağlanır. */
  function hizKapisi(ad: HizKapisiAdi) {
    return async (req: any, reply: any) => {
      const karar = hizlar[ad].bak(`${ad}:${istemciAdresi(req, vekilGuvenilir)}`);
      if (!karar.ok) {
        reply.header('retry-after', String(karar.yenidenDeneSn));
        return reply.code(429).send({
          error: `Çok fazla deneme. ${karar.yenidenDeneSn} saniye sonra tekrar deneyin.`,
        });
      }
    };
  }
  // `origin: true` her kaynağı yansıtır. Varsayılan olarak yalnızca web
  // istemcisinin adresi ve yerel geliştirme kaynakları kabul edilir.
  const allowedOrigins =
    options.allowedOrigins ??
    (process.env.STORYBOARD_ALLOWED_ORIGINS
      ? process.env.STORYBOARD_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      /* Açık liste verilmemişse: uygulamanın KENDİ portlarından gelen her
         adres kabul edilir.
         Eskiden sabit `localhost` listesi vardı ve ÖLÇÜLDÜ (kullanıcı
         bildirimi 2026-08-26): başka bir makineden gelen davetli
         `http://192.168.x.x:5174` kaynağıyla geliyor, listede olmadığı için
         CORS onu engelliyordu — davet linki düzeltilse bile bağlanamazdı.
         Aynı hatanın ikinci katmanıydı.
         ⚠ Güvenlik tavanı: bu, ODAYA erişimi açmaz. Odaya girmek DAVET
         JETONU ister ve yetki denetimi ayrı katmanda; CORS burada yalnız
         "hangi sayfa bu API'yi çağırabilir" sorusunu yanıtlıyor. Sıkı
         kısıtlama isteyen `STORYBOARD_ALLOWED_ORIGINS` verir. */
      : UYGULAMA_PORTLARI);
  await fastify.register(cors, {
    origin: allowedOrigins === true ? true : (origin, cb) => {
      /* Port tabanlı kabul: liste SAYILARDAN oluşuyorsa adres değil PORT
         karşılaştırılıyor. Böylece aynı uygulama hangi makineden açılırsa
         açılsın çalışıyor, başka bir uygulama çalışmıyor. */
      if (origin && Array.isArray(allowedOrigins)
        && allowedOrigins.every((o) => typeof o === 'number')) {
        let kabul = false;
        try {
          const p = Number(new URL(origin).port);
          kabul = (allowedOrigins as unknown as number[]).includes(p);
        } catch { kabul = false; }
        return cb(null, kabul);
      }
      // Origin başlığı olmayan istekler (Electron, curl) engellenmez.
      if (!origin || (allowedOrigins as string[]).includes(origin)) cb(null, true);
      else cb(new Error('Bu kaynağa izin verilmiyor.'), false);
    },
  });

  /** Token'ı doğrular ve odadaki güncel rolü döndürür. */
  function authenticate(
    room: Room,
    token: string | null,
  ): { payload: TokenPayload; role: Role } | null {
    if (!token) return null;
    const payload = verify(token, secret);
    if (!payload || payload.roomId !== room.id) return null;
    /* Hesap jetonu ODA jetonu DEĞİLDİR. `roomId` denetimi bunu zaten
       kapatıyor (hesap jetonunda alan yok) ama tür de açıkça sınanıyor:
       tek bir denetime bel bağlamak, o denetim ileride gevşetildiğinde
       yetki yükseltmeye dönüşür. */
    // Davet yalnız joinRoom'da tüketilir; veri erişimi oturum jetonu ister.
    if (payload.kind !== 'session' || !payload.sub) return null;
    // Rol sunucu tarafında saklanan kullanıcı kaydından okunur; token'daki
    // rol yalnızca ilk atama için kullanılır. Böylece rol değişikliği anında
    // etkili olur ve eski token yükseltilmiş yetki taşıyamaz.
    const stored = payload.sub ? room.users.get(payload.sub) : undefined;
    const role = stored?.role ?? payload.role;
    if (!role || !ROLES.includes(role)) return null;
    return { payload, role };
  }

  /* ------------------------------ hesaplar --------------------------- */

  /** Hesabın erişim jetonundan hesabı çözer. Süresi dolmuşsa `null`. */
  function hesapCoz(token: string | null): Hesap | null {
    if (!token) return null;
    const payload = verify(token, secret);
    if (!payload || payload.kind !== 'hesap' || !payload.sub) return null;
    return hesaplar.kimlikleBul(payload.sub) ?? null;
  }

  /**
   * Erişim + yenileme jetonu çifti üretir.
   *
   * Yenileme jetonunun kimliği hesapta SAKLANIYOR: jetonun kendisi durum
   * taşımadığı için iptal ve döndürme ancak sunucu tarafında bir kayıtla
   * mümkün. Kullanılan yenileme jetonu listeden düşürülür — çalınan bir
   * yenileme jetonu ikinci kez işe yaramaz.
   */
  function jetonCifti(hesap: Hesap) {
    const simdi = Date.now();
    const yenilemeId = newId('yen');
    hesap.yenilemeler.add(yenilemeId);
    return {
      hesapId: hesap.hesapId,
      eposta: hesap.eposta,
      ad: hesap.ad,
      erisimToken: sign(
        { jti: newId('ers'), sub: hesap.hesapId, name: hesap.ad, kind: 'hesap', exp: simdi + HESAP_ERISIM_MS },
        secret,
      ),
      erisimBitis: simdi + HESAP_ERISIM_MS,
      yenilemeToken: sign(
        { jti: yenilemeId, sub: hesap.hesapId, kind: 'yenileme', exp: simdi + HESAP_YENILEME_MS },
        secret,
      ),
    };
  }

  const HESAP_GOVDE = {
    type: 'object',
    additionalProperties: false,
    required: ['eposta', 'parola'],
    properties: {
      eposta: { type: 'string', minLength: 3, maxLength: 254 },
      parola: { type: 'string', minLength: PAROLA_EN_AZ, maxLength: PAROLA_EN_COK },
      ad: { type: 'string', maxLength: 80 },
    },
  } as const;

  fastify.post<{ Body: { eposta: string; parola: string; ad?: string } }>(
    '/api/hesap/kayit',
    { onRequest: hizKapisi('kayit'), schema: { body: HESAP_GOVDE } },
    async (req, reply) => {
      const eposta = epostaNormalle(req.body?.eposta);
      if (!eposta) return reply.code(400).send({ error: 'Geçersiz e-posta adresi.' });
      if (!parolaGecerliMi(req.body?.parola)) {
        return reply.code(400).send({ error: `Parola en az ${PAROLA_EN_AZ} karakter olmalı.` });
      }
      const hesap = await hesaplar.olustur(eposta, req.body.parola, req.body?.ad ?? '');
      if (!hesap) return reply.code(409).send({ error: 'Bu e-posta ile bir hesap zaten var.' });
      return reply.send(jetonCifti(hesap));
    },
  );

  fastify.post<{ Body: { eposta: string; parola: string } }>(
    '/api/hesap/giris',
    { onRequest: hizKapisi('giris'), schema: { body: HESAP_GOVDE } },
    async (req, reply) => {
      const eposta = epostaNormalle(req.body?.eposta);
      const hesap = eposta ? hesaplar.epostaylaBul(eposta) : undefined;
      /* Hesap yoksa da bir scrypt yakılıyor (`sahteDogrulama`): iki yolun
         süresi ayrışsaydı hangi e-postaların kayıtlı olduğu yanıt süresinden
         okunurdu. Hata mesajı da TEK: "e-posta yanlış" ile "parola yanlış"ı
         ayırmak aynı bilgiyi açıkça verirdi. */
      const dogru = hesap ? await parolaDogruMu(hesap, req.body?.parola) : await sahteDogrulama(req.body?.parola);
      if (!hesap || !dogru) return reply.code(401).send({ error: 'E-posta ya da parola hatalı.' });
      return reply.send(jetonCifti(hesap));
    },
  );

  fastify.post<{ Body: { yenilemeToken: string } }>(
    '/api/hesap/yenile',
    {
      onRequest: hizKapisi('yenile'),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['yenilemeToken'],
          properties: { yenilemeToken: { type: 'string', minLength: 8, maxLength: 4096 } },
        },
      },
    },
    async (req, reply) => {
      const payload = verify(req.body?.yenilemeToken, secret);
      if (!payload || payload.kind !== 'yenileme' || !payload.sub) {
        return reply.code(401).send({ error: 'Yenileme jetonu geçersiz ya da süresi dolmuş.' });
      }
      const hesap = hesaplar.kimlikleBul(payload.sub);
      // Kayıtta yoksa: ya iptal edildi ya da ZATEN KULLANILDI (döndürme).
      if (!hesap || !hesap.yenilemeler.delete(payload.jti)) {
        return reply.code(401).send({ error: 'Yenileme jetonu geçersiz ya da süresi dolmuş.' });
      }
      return reply.send(jetonCifti(hesap));
    },
  );

  fastify.get('/api/hesap/ben', async (req, reply) => {
    const hesap = hesapCoz(bearer(req.headers.authorization));
    if (!hesap) return reply.code(401).send({ error: 'Oturum jetonu geçersiz ya da süresi dolmuş.' });
    // Parola türevi ve tuz DIŞARI ÇIKMAZ — alanlar tek tek seçiliyor.
    return reply.send({ hesapId: hesap.hesapId, eposta: hesap.eposta, ad: hesap.ad });
  });

  function requireOwner(room: Room, token: string | null): boolean {
    const auth = authenticate(room, token);
    return auth?.role === 'owner';
  }

  /* ---------------------------- oturumlar ---------------------------- */

  fastify.post<{ Body: { projectName?: string; ownerName?: string } }>(
    '/api/sessions',
    {
      onRequest: hizKapisi('oturumAc'),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            projectName: { type: 'string', maxLength: 200 },
            ownerName: { type: 'string', maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      /* Hesap jetonu VARSA oda sahipliği o hesaba bağlanır; zorunluysa
         jetonsuz oda hiç açılmaz. Zorunlu değilken eski davranış aynen
         sürüyor — hesapsız kurulumlar kırılmıyor. */
      const hesap = hesapCoz(bearer(req.headers.authorization));
      if (hesapZorunlu && !hesap) {
        return reply.code(401).send({ error: 'Oturum açmak için hesabınıza giriş yapmalısınız.' });
      }

      const projectName = (req.body?.projectName ?? 'İsimsiz Proje').slice(0, 200);
      const ownerName = (hesap?.ad ?? req.body?.ownerName ?? 'Sahip').slice(0, 80);

      const ownerTokenId = newId('tok');
      const room = createRoom(projectName, ownerTokenId);
      const ownerUserId = hesap?.hesapId ?? newId('usr');
      room.users.set(ownerUserId, {
        userId: ownerUserId,
        name: ownerName,
        role: 'owner',
        online: false,
        hesapId: hesap?.hesapId,
        eposta: hesap?.eposta,
      });

      const ownerToken = sign(
        {
          jti: ownerTokenId,
          roomId: room.id,
          role: 'owner',
          sub: ownerUserId,
          name: ownerName,
          kind: 'session',
          exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
        },
        secret,
      );

      return reply.send({
        roomId: room.id,
        roomCode: room.code,
        ownerToken,
        ownerUserId,
        inviteUrl: `${publicWebUrl(req, webAppUrl, WEB_PORT, !!tls)}/?oda=${room.code}`,
        wsUrl: publicWsUrl(req, port, !!tls),
      });
    },
  );

  fastify.delete<{ Params: { roomId: string } }>('/api/sessions/:roomId', { schema: { params: ODA_PARAM } }, async (req, reply) => {
    const room = getRoom(req.params.roomId);
    if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
    if (!requireOwner(room, bearer(req.headers.authorization)))
      return reply.code(403).send({ error: 'Bu işlem için Sahip rolü gerekir.' });
    /* 'arsivle': sahibin "oturumu kapat" isteği dosyaları SİLMEZ, `silinen/`
       altına taşır (§15.3). Bu düğmeye yanlışlıkla basılabilir ve aylarca
       emek onun arkasında durur. */
    closeRoom(room.id, 'arsivle');
    return reply.send({ ok: true });
  });

  /* ----------------------------- davetler ---------------------------- */

  fastify.post<{
    Params: { roomId: string };
    Body: { role?: Role; expiresInMinutes?: number; label?: string; kullanimSiniri?: number; eposta?: string };
  }>(
    '/api/sessions/:roomId/invites',
    {
      onRequest: hizKapisi('davet'),
      schema: {
        params: ODA_PARAM,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string', enum: ROLES },
            expiresInMinutes: { type: 'integer', minimum: 1, maximum: 60 * 24 * 30 },
            label: { type: 'string', maxLength: 120 },
            kullanimSiniri: { type: 'integer', minimum: 1, maximum: 50 },
            eposta: { type: 'string', minLength: 3, maxLength: 254 },
          },
        },
      },
    },
    async (req, reply) => {
      const room = getRoom(req.params.roomId);
      if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
      if (!requireOwner(room, bearer(req.headers.authorization)))
        return reply.code(403).send({ error: 'Davet oluşturmak için Sahip rolü gerekir.' });

      const role = (req.body?.role ?? 'editor') as Role;
      if (!ROLES.includes(role) || role === 'owner') {
        return reply.code(400).send({ error: 'Geçersiz rol.' });
      }

      /* Davet belirli bir hesaba bağlanabilir. Bağlıysa jeton ile hesap
         BİRLİKTE gerekir; jeton tek başına yetmez. */
      let eposta: string | null = null;
      if (req.body?.eposta !== undefined) {
        eposta = epostaNormalle(req.body.eposta);
        if (!eposta) return reply.code(400).send({ error: 'Geçersiz e-posta adresi.' });
      }

      const minutes = Math.min(Math.max(req.body?.expiresInMinutes ?? DEFAULT_INVITE_MINUTES, 1), 60 * 24 * 30);
      const tokenId = newId('inv');
      const expiresAt = Date.now() + minutes * 60_000;
      const token = sign(
        { jti: tokenId, roomId: room.id, role, kind: 'invite', exp: expiresAt },
        secret,
      );

      room.invites.set(tokenId, {
        tokenId,
        token,
        role,
        expiresAt,
        revoked: false,
        usedBy: null,
        label: req.body?.label,
        // Varsayılan TEK KULLANIMLIK — gerekçe `Invite.kullanimSiniri`'nde.
        kullanimSiniri: req.body?.kullanimSiniri ?? 1,
        kullanim: 0,
        eposta,
      });

      return reply.send({
        tokenId,
        token,
        role,
        expiresAt,
        kullanimSiniri: req.body?.kullanimSiniri ?? 1,
        eposta,
        inviteUrl: `${publicWebUrl(req, webAppUrl, WEB_PORT, !!tls)}/?oda=${room.code}&davet=${encodeURIComponent(token)}`,
      });
    },
  );

  fastify.get<{ Params: { roomId: string } }>('/api/sessions/:roomId/invites', { schema: { params: ODA_PARAM } }, async (req, reply) => {
    const room = getRoom(req.params.roomId);
    if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
    if (!requireOwner(room, bearer(req.headers.authorization)))
      return reply.code(403).send({ error: 'Yetki yok.' });

    return reply.send({
      invites: [...room.invites.values()].map((inv) => ({
        ...inv,
        inviteUrl: `${publicWebUrl(req, webAppUrl, WEB_PORT, !!tls)}/?oda=${room.code}&davet=${encodeURIComponent(inv.token)}`,
      })),
    });
  });

  fastify.delete<{ Params: { roomId: string; tokenId: string } }>(
    '/api/sessions/:roomId/invites/:tokenId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roomId', 'tokenId'],
          properties: { roomId: KIMLIK, tokenId: KIMLIK },
        },
      },
    },
    async (req, reply) => {
      const room = getRoom(req.params.roomId);
      if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
      if (!requireOwner(room, bearer(req.headers.authorization)))
        return reply.code(403).send({ error: 'Yetki yok.' });
      const invite = room.invites.get(req.params.tokenId);
      if (!invite) return reply.code(404).send({ error: 'Davet bulunamadı.' });
      invite.revoked = true;
      return reply.send({ ok: true });
    },
  );

  /* ------------------------------ katılma ---------------------------- */

  async function joinRoom(room: Room, token: string, name: string, hesap: Hesap | null, reply: any) {
    if (hesapZorunlu && !hesap) {
      return reply.code(401).send({ error: 'Odaya katılmak için hesabınıza giriş yapmalısınız.' });
    }
    const payload = verify(token, secret);
    if (!payload || payload.roomId !== room.id) {
      return reply.code(401).send({ error: 'Davet geçersiz ya da süresi dolmuş.' });
    }
    if (payload.kind !== 'invite' && payload.kind !== 'session') {
      return reply.code(401).send({ error: 'Davet geçersiz ya da süresi dolmuş.' });
    }
    const invite = room.invites.get(payload.jti);
    if (payload.kind === 'invite') {
      if (!invite) return reply.code(401).send({ error: 'Davet bulunamadı.' });
      if (invite.revoked) return reply.code(403).send({ error: 'Davet iptal edilmiş.' });
      if (Date.now() > invite.expiresAt) return reply.code(403).send({ error: 'Davetin süresi dolmuş.' });
      /* DAVET EDİLEN KULLANICI girer, jetonu olan değil: davet bir hesaba
         bağlıysa jeton başka bir hesapla işe yaramaz. */
      if (invite.eposta) {
        if (!hesap) return reply.code(401).send({ error: 'Bu davet bir hesaba bağlı; giriş yapmalısınız.' });
        if (hesap.eposta !== invite.eposta) {
          return reply.code(403).send({ error: 'Bu davet başka bir hesaba gönderilmiş.' });
        }
      }
      /* Kullanım sınırı SAYILARAK uygulanıyor. Yalnız `usedBy` bakılsaydı
         (eski davranış) alan doluyordu ama hiçbir yerde OKUNMUYORDU: sızan
         bir bağlantıyla sınırsız kişi girebiliyordu. */
      if (invite.kullanim >= invite.kullanimSiniri) {
        return reply.code(403).send({ error: 'Bu davet bağlantısı zaten kullanılmış.' });
      }
    }

    /* Kimlik hesaba bağlıysa oda üyeliği HESAP kimliğiyle anılıyor: aynı
       kişi ikinci kez katıldığında yeni bir katılımcı kaydı doğmuyor ve
       sahibin verdiği rol kişiye YAPIŞIK kalıyor. */
    const userId = hesap?.hesapId ?? payload.sub ?? newId('usr');
    const displayName = (hesap?.ad || name || payload.name || 'Konuk').slice(0, 80);
    const tokenRole = payload.role;
    if (!tokenRole || !ROLES.includes(tokenRole)) {
      return reply.code(401).send({ error: 'Davet geçersiz ya da süresi dolmuş.' });
    }
    const role: Role = room.users.get(userId)?.role ?? tokenRole;
    room.users.set(userId, {
      userId,
      name: displayName,
      role,
      online: false,
      hesapId: hesap?.hesapId,
      eposta: hesap?.eposta,
    });

    if (invite && payload.kind === 'invite') {
      invite.kullanim += 1;
      if (!invite.usedBy) invite.usedBy = userId;
    }

    const sessionToken = sign(
      {
        jti: newId('ses'),
        roomId: room.id,
        role,
        sub: userId,
        name: displayName,
        kind: 'session',
        exp: Date.now() + oturumDakika * 60_000,
      },
      secret,
    );

    return reply.send({
      sessionToken,
      role,
      roomId: room.id,
      roomCode: room.code,
      projectName: room.projectName,
      userId,
      userName: displayName,
      wsUrl: publicWsUrl(reply.request, port, !!tls),
    });
  }

  const KATIL_ALANLARI = {
    token: { type: 'string', minLength: 8, maxLength: 4096 },
    name: { type: 'string', maxLength: 80 },
  } as const;

  fastify.post<{ Params: { roomId: string }; Body: { token?: string; name?: string } }>(
    '/api/sessions/:roomId/join',
    {
      onRequest: hizKapisi('katil'),
      schema: {
        params: ODA_PARAM,
        body: { type: 'object', additionalProperties: false, properties: KATIL_ALANLARI },
      },
    },
    async (req, reply) => {
      const room = getRoom(req.params.roomId);
      if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
      if (!req.body?.token) return reply.code(400).send({ error: 'Davet token’ı gerekli.' });
      return joinRoom(room, req.body.token, req.body?.name ?? '', hesapCoz(bearer(req.headers.authorization)), reply);
    },
  );

  fastify.post<{ Body: { code?: string; token?: string; name?: string } }>(
    '/api/sessions/join-by-code',
    {
      onRequest: hizKapisi('katil'),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { ...KATIL_ALANLARI, code: { type: 'string', maxLength: 32 } },
        },
      },
    },
    async (req, reply) => {
      const code = req.body?.code ?? '';
      const room = getRoomByCode(code);
      if (!room) return reply.code(404).send({ error: 'Bu koda ait oda bulunamadı.' });
      if (!req.body?.token) return reply.code(400).send({ error: 'Davet token’ı gerekli.' });
      return joinRoom(room, req.body.token, req.body?.name ?? '', hesapCoz(bearer(req.headers.authorization)), reply);
    },
  );

  /**
   * Oda oturum jetonunu tazeler.
   *
   * NEDEN: jeton kısa ömürlü olacaksa yenilenebilir OLMAK ZORUNDA — yoksa
   * uzun bir yazım oturumunun ortasında bağlantı kopar ve kullanıcı belgesini
   * kaybetmiş sanır. GEÇERLİ bir jeton isteniyor: süresi dolmuş jetonla
   * tazeleme, süre sınırını hiç olmamış sayardı.
   */
  fastify.post<{ Params: { roomId: string } }>(
    '/api/sessions/:roomId/refresh',
    { schema: { params: ODA_PARAM } },
    async (req, reply) => {
      const room = getRoom(req.params.roomId);
      if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
      const auth = authenticate(room, bearer(req.headers.authorization));
      if (!auth || auth.payload.kind !== 'session' || !auth.payload.sub) {
        return reply.code(401).send({ error: 'Oturum jetonu geçersiz ya da süresi dolmuş.' });
      }
      const bitis = Date.now() + oturumDakika * 60_000;
      return reply.send({
        sessionToken: sign(
          {
            jti: newId('ses'),
            roomId: room.id,
            role: auth.role,
            sub: auth.payload.sub,
            name: auth.payload.name,
            kind: 'session',
            exp: bitis,
          },
          secret,
        ),
        role: auth.role,
        expiresAt: bitis,
      });
    },
  );

  /* ------------------------------- roller ---------------------------- */

  fastify.get<{ Params: { roomId: string } }>('/api/sessions/:roomId/participants', { schema: { params: ODA_PARAM } }, async (req, reply) => {
    const room = getRoom(req.params.roomId);
    if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
    const auth = authenticate(room, bearer(req.headers.authorization));
    if (!auth) return reply.code(401).send({ error: 'Yetkisiz.' });
    return reply.send({ participants: [...room.users.values()] });
  });

  fastify.post<{ Params: { roomId: string }; Body: { userId?: string; role?: Role } }>(
    '/api/sessions/:roomId/roles',
    {
      schema: {
        params: ODA_PARAM,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['userId', 'role'],
          properties: { userId: KIMLIK, role: { type: 'string', enum: ROLES } },
        },
      },
    },
    async (req, reply) => {
      const room = getRoom(req.params.roomId);
      if (!room) return reply.code(404).send({ error: 'Oda bulunamadı.' });
      if (!requireOwner(room, bearer(req.headers.authorization)))
        return reply.code(403).send({ error: 'Rol değiştirmek için Sahip rolü gerekir.' });

      const { userId, role } = req.body ?? {};
      if (!userId || !role || !ROLES.includes(role)) {
        return reply.code(400).send({ error: 'Geçersiz istek.' });
      }
      if (!applyRoleChange(room, userId, role)) {
        return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' });
      }
      return reply.send({ ok: true });
    },
  );

  /**
   * Sağlık kontrolü — kalıcılık arızasının SESSİZ kalmadığı yer.
   *
   * §15.4'ün masaüstündeki karşılığı "engelleyici şerit"tir; sunucunun ekranı
   * yoktur, izleyicisi vardır. Arka arkaya ikinci yazma hatasında bu uç
   * 503 dönüyor: bildirimi kaçırmak mümkündür, sağlık kontrolünün kırmızıya
   * dönmesini kaçırmak değildir.
   */
  fastify.get('/api/health', async (_req, reply) => {
    const kdurum = depo.durum();
    const govde = {
      ok: !kdurum.engelleyici,
      rooms: listRooms().length,
      uptime: process.uptime(),
      tls: !!tls,
      kalicilik: {
        dizin: dataDir,
        sonYazim: kdurum.sonYazim,
        ardArdaHata: kdurum.ardArdaHata,
        sonHata: kdurum.sonHata,
        engelleyici: kdurum.engelleyici,
      },
    };
    return reply.code(kdurum.engelleyici ? 503 : 200).send(govde);
  });

  /* ---------------------------- WebSocket ---------------------------- */

  await fastify.listen({ port, host });

  /* ERİŞİLEBİLİR ADRESLER AÇILIŞTA YAZILIYOR.
     Sunucu `0.0.0.0`'da dinliyor, yani ağdan erişilebilir — ama kullanıcı
     hangi adresi paylaşacağını bilmiyordu ve `localhost` paylaşıyordu.
     Adresi göstermek, davetin çalışmama sebebini ortadan kaldırıyor. */
  const sema = tls ? 'https' : 'http';
  for (const adres of yerelAdresler()) {
    console.log(`[sunucu] ağdan erişim: ${sema}://${adres}:${port}`);
  }
  const address = fastify.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  // Sınırsız mesaj boyutu tek bir istemcinin sunucu belleğini tüketmesine izin verir.
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxMessageBytes ?? 64 * 1024 * 1024,
  });

  fastify.server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    // y-websocket istemcisi odayı yol parçası olarak gönderir: /<roomId>?token=...
    const roomId = url.pathname.replace(/^\/+/, '').split('/')[0];
    const token = url.searchParams.get('token');
    const room = getRoom(roomId);

    if (!room || room.closed) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    /* KİMLİK ÖNCE, VERİ SONRA. `handleUpgrade` bu satırın ALTINDA: kimliği
       doğrulanmamış sokete oda verisi (rol bildirimi, SYNC_STEP1, awareness)
       hiç yazılmıyor — bağlantı el sıkışmayı bile tamamlamadan düşüyor.
       Ölçüldü: `tests/guvenlik.test.ts` yetkisiz soketin tek bayt bile
       almadığını sınıyor. */
    const auth = authenticate(room, token);
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    /* Bağlantı sınırı kimlikten SONRA: sayaç ancak gerçek bir kullanıcıya
       yazılmalı, aksi halde yetkisiz bir sel dürüst istemcinin kotasını
       yerdi. */
    const adres = istemciAdresi(request, vekilGuvenilir);
    if (!baglantilar.ac(adres)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    /* Sayaç HAM sokete bağlanıyor, `ws`'e değil: el sıkışma tamamlanmadan
       düşen bir bağlantıda `handleUpgrade` geri çağrısı HİÇ çalışmaz ve
       sayaç sızardı — istemci yarım el sıkışmaları tekrarlayarak kendi
       kotasını (sonra da sunucuyu) sessizce doldurabilirdi. Ham soket her
       iki durumda da kapanır. 'close' ve 'error' birlikte tetiklenebildiği
       için tek seferlik. */
    let dustu = false;
    const dus = () => {
      if (dustu) return;
      dustu = true;
      baglantilar.kapat(adres);
    };
    socket.on('close', dus);
    socket.on('error', dus);

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const userId = auth.payload.sub!;
      const name = auth.payload.name ?? 'Konuk';
      if (!room.users.has(userId)) {
        room.users.set(userId, { userId, name, role: auth.role, online: true });
      } else {
        room.users.get(userId)!.online = true;
      }
      const conn: Connection = { socket: ws, userId, role: auth.role, name };
      setupConnection(room, conn);
    });
  });

  const sweeper = setInterval(() => {
    sweepRooms(options.roomIdleMs ?? 1000 * 60 * 60 * 6);
    /* Hız sayaçları da süpürülüyor: her farklı adres bir anahtar bırakıyor
       ve temizlenmezse sayaç haritası saldırganın istediği kadar büyürdü —
       hız sınırının kendisi bir bellek saldırısına dönerdi. */
    for (const s of Object.values(hizlar)) s.temizle();
  }, 60_000);

  return {
    fastify,
    wss,
    hesaplar,
    port: actualPort,
    url: `${sema}://localhost:${actualPort}`,
    wsUrl: `${tls ? 'wss' : 'ws'}://localhost:${actualPort}`,
    tls: !!tls,
    dataDir,
    async close() {
      clearInterval(sweeper);
      kalicilik.durdur();
      /* `closeRoom` varsayılan 'bosalt' niyetiyle son hâli diske YAZAR.
         Kapanışta yazmasaydı düzgün bir `SIGTERM` bile son turun ardından
         gelen işi götürürdü — çökmede korunan veri, planlı kapanışta
         kaybolurdu. */
      for (const room of listRooms()) closeRoom(room.id);
      kalicilikKur(null, null);
      wss.close();
      await fastify.close();
    },
  };
}

/**
 * Davet linkinin göstereceği WEB UYGULAMASI adresi.
 *
 * ## Neden istekten türetiliyor
 *
 * Sabit `localhost:5174` yazılıyordu ve ÖLÇÜLDÜ (kullanıcı bildirimi
 * 2026-08-26): daveti alan kişi linki açınca KENDİ bilgisayarındaki 5174
 * portuna gidiyor, orada bir şey olmadığı için "bağlanamadı" diyor. Yani
 * ortak çalışma davetleri aynı makine dışında HİÇ çalışmıyordu.
 *
 * `STORYBOARD_WEB_URL` verilmişse o kazanır — dağıtımda web uygulaması
 * gerçekten başka bir alan adında olabilir ve orayı yalnız kuran bilir.
 * Verilmemişse isteğin geldiği HOST kullanılıyor: sahibi sunucuya hangi
 * adresle ulaştıysa, davetli de aynı adresle ulaşabilir.
 *
 * ⚠ TAVAN: bu, adresi DOĞRU yapar ama ERİŞİLEBİLİR yapmaz. NAT arkasındaki
 * bir sunucuya başka bir ağdan bağlanmak için port yönlendirme ya da tünel
 * gerekir; bu bir ağ meselesidir, kodla çözülmez. Arayüz bu yüzden geri
 * döngü (loopback) adresi ürettiğinde kullanıcıyı UYARIYOR — sessizce
 * çalışmayan bir link vermek, hiç vermemekten kötü.
 */
export function publicWebUrl(
  req: { headers: Record<string, unknown> },
  yapilandirilmis: string | undefined,
  webPort: number,
  guvenli = false,
): string {
  if (yapilandirilmis) return yapilandirilmis;
  const host = (req.headers?.host as string) ?? '';
  /* İKİ bağımsız kaynak: sunucu TLS'i KENDİ sonlandırıyorsa `guvenli`, ters
     vekil sonlandırıyorsa `x-forwarded-proto`. Yalnız birine bakmak, öteki
     dağıtım biçiminde `http://` link üretirdi. */
  const proto =
    guvenli || (req.headers?.['x-forwarded-proto'] as string) === 'https' ? 'https' : 'http';
  /* Sunucu portu ile web uygulamasının portu FARKLI; host'un yalnız makine
     kısmı alınıp web portu ekleniyor. IPv6 köşeli parantezli biçim de
     korunuyor. */
  const makine = host.replace(/:\d+$/u, '');
  if (!makine) return `http://localhost:${webPort}`;
  return `${proto}://${makine}:${webPort}`;
}

/** Adres yalnız BU makineden erişilebilir mi (geri döngü). */
export function geriDonguMu(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return true;
  }
}

/**
 * Bu makinenin LAN adresleri.
 *
 * Geri döngü ve dahili arayüzler atılıyor: kullanıcıya paylaşabileceği
 * adresi göstermek gerekiyor, `127.0.0.1` paylaşılamaz.
 */
export function yerelAdresler(): string[] {
  const adresler: string[] = [];
  for (const arayuz of Object.values(networkInterfaces())) {
    for (const a of arayuz ?? []) {
      if (a.internal) continue;
      if (a.family !== 'IPv4') continue;
      adresler.push(a.address);
    }
  }
  return adresler;
}

export function publicWsUrl(
  req: { headers: Record<string, unknown> },
  port: number,
  guvenli = false,
): string {
  const host = (req.headers?.host as string) ?? `localhost:${port}`;
  /* HTTPS dinleyen bir sunucuya `ws://` ile bağlanmak tarayıcıda karışık
     içerik olarak ENGELLENİR: şema yanlış üretilirse ortak çalışma HİÇ
     kurulmaz. İki kaynak `publicWebUrl` ile aynı gerekçeyle birleşiyor. */
  const proto =
    guvenli || (req.headers?.['x-forwarded-proto'] as string) === 'https' ? 'wss' : 'ws';
  return `${proto}://${host}`;
}
