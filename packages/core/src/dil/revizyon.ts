import { RENK_ADLARI, ustbilgiMetni, type Revizyon } from '../model/revizyon';
import { arayuzDili, t } from './arayuz';

/** Kullanıcının verdiği ad çevrilmez; yalnız varsayılan renk adı çevrilir. */
export function revizyonAdiArayuz(revizyon: Revizyon): string {
  return revizyon.ad.trim() || t(RENK_ADLARI[revizyon.renk]);
}

/** PDF üstbilgisi belge dilinde kalırken arayüz etiketi arayüz dilini izler. */
export function ustbilgiMetniArayuz(revizyon: Revizyon): string {
  const dil = arayuzDili();
  return ustbilgiMetni(
    { ...revizyon, ad: revizyonAdiArayuz(revizyon).toLocaleUpperCase(dil) },
    t('Revizyon').toLocaleUpperCase(dil),
  );
}
