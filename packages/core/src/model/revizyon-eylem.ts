import type * as Y from 'yjs';
import * as M from '../doc/mutations';
import { revizyonAdiArayuz } from '../dil/revizyon';
import { t } from '../dil/arayuz';

/**
 * Revizyon eylemleri — ŞERİT ve KISAYOL aynı kodu çağırır.
 *
 * Ayrı yazılsalardı iki yol ayrışırdı: şerit "önce bir revizyon açın" diye
 * uyarırken kısayol sessizce hiçbir şey yapardı ve kullanıcı tuşun bozuk
 * olduğunu sanırdı. Kural tek yerde (Karar 2).
 *
 * Bildirim İŞİN PARÇASI, süsü değil: `revizyonIsaretCevir` etkin revizyon
 * yoksa `false` dönüp SESSİZCE geçiyor; sessizliği kullanıcıya çevirmek
 * çağıranın yükümlülüğü (§15.4).
 */

export type Bildir = (mesaj: string, tur: 'success' | 'info' | 'error') => void;

/** Seçili satırları etkin revizyonda işaretler/işareti kaldırır. */
export function revizyonIsaretleEylemi(
  doc: Y.Doc,
  secili: readonly string[],
  bildir: Bildir,
): boolean {
  if (!secili.length) {
    bildir(t('Önce işaretlenecek satırları seçin.'), 'info');
    return false;
  }
  if (!M.etkinRevizyon(doc)) {
    bildir(t('Önce bir revizyon açın.'), 'error');
    return false;
  }
  M.revizyonIsaretCevir(doc, [...secili]);
  return true;
}

/** Yeni revizyon turu açar. Geri alınabilir (Ctrl+Z) — kök geri-al kapsamında. */
export function revizyonYayinlaEylemi(doc: Y.Doc, bildir: Bildir): void {
  const yeni = M.revizyonYayinla(doc);
  bildir(`${revizyonAdiArayuz(yeni)} ${t('revizyonu açıldı')} — ${t('geri almak için Ctrl+Z')}`, 'success');
}
