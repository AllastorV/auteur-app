import { useMemo } from 'react';
import { useUiStore } from '../store/ui';
import { tipProfili } from '../format/profil';
import { yaziTipi } from '../format/yazi';
import { bolunmeyiKur } from '../format/iki-sutun';
import { useProjectStore } from '../store/project';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../model/dokuman-tipi';
import { profileUygula } from '../format/preset';
import type { PresetRed } from '../format/preset';
import type { ScriptBlockType } from '../model/script';
import type { FormatProfili, DilAdi } from '../format/profil';
import type { KagitAdi } from '../format/izgara';
import type { PresetTablosu } from '../format/preset';
import type { YaziTipiAdi } from '../format/yazi';

/**
 * Senaryo format profilinin TEK kurulum yeri.
 *
 * Kural şuydu: profil = taban profil + kullanıcının yazım presetleri. İki
 * yerde yaşadığı sürece bir tarafın presetleri unutması SESSİZ bir ıraksama
 * üretti: editör presetli profille sayfalıyordu, dışa aktarım presetsiz
 * profille — ölçüldü, aynı senaryoda editör 5 sayfa, PDF 3 sayfa (Karar 34 ve
 * §12 F1c'nin "dışa aktarılan sayfa sayısı editördekiyle aynı" sözü).
 *
 * Karar 34 tek SAYFALAYICI'yı garanti ediyordu ama tek PROFİLİ etmiyordu:
 * iki yol aynı fonksiyonu farklı girdiyle çağırınca garanti oradan sızdı.
 * Profil artık yalnız buradan kuruluyor; presetsiz kurmanın yolu kalmadı.
 */
export interface SenaryoProfili {
  profil: FormatProfili;
  /** Uygulanamayan presetler — §6.4: boş değilse arayüz GÖSTERMEK zorunda. */
  redler: Partial<Record<ScriptBlockType, PresetRed[]>>;
}

/** `senaryoProfiliKur`'un girdisi — hepsi ya belgeden ya tercihlerden. */
export interface ProfilGirdisi {
  /** Belgenin doküman tipi kimliği. Bilinmiyorsa `senaryo`ya düşer. */
  tipAdi: string | undefined;
  /** Belgenin KENDİ dili — varsa tercihi ezer. */
  belgeDili: DilAdi | undefined;
  kagit: KagitAdi;
  tercihDili: DilAdi;
  presetler: PresetTablosu;
  yaziAdi: YaziTipiAdi;
  solSutun: number;
}

/**
 * Profilin SAF kurucusu — hook'un gövdesi.
 *
 * Ayrı duruyor çünkü bir yer profili BAŞKA bir belge için kurmak zorunda:
 * fon dosyası tazelenirken sayfa sayıları KAYNAK senaryonun profiliyle
 * ölçülmeli, açık fon belgesininkiyle değil. Hook'u oradan çağırmak
 * mümkün değil (React kuralı) ve ifadeyi elle kopyalamak, bu dosyanın
 * bütün yorumunun uyardığı ıraksamayı geri getirirdi.
 */
export function senaryoProfiliKur(g: ProfilGirdisi): SenaryoProfili {
  /* Bilinmeyen tip `senaryo`ya düşüyor AMA yalnız BURADA ve bilinçli:
     eski projelerde alan hiç yok ve F7'den önce her belge senaryoydu.
     `tipProfili` kendisi fırlatıyor — düşürme kararı okuyucuya ait. */
  const tip = dokumanTipi(g.tipAdi) ?? DOKUMAN_TIPLERI.senaryo;
  /* Yazı tercihi profile GİRİYOR ama kilidi `tipProfili` uyguluyor:
     senaryo ailesinde verilen değer yok sayılıp Courier'e dönüyor. Kilidi
     burada denetleseydik aynı kural iki evde yaşardı (Karar 2). */
  return profileUygula(
    tipProfili(tip.id, g.kagit, g.belgeDili ?? g.tercihDili, yaziTipi(g.yaziAdi) ?? undefined,
      bolunmeyiKur(g.solSutun)),
    g.presetler,
  );
}

export function useSenaryoProfili(): SenaryoProfili {
  const kagit = useUiStore((s) => s.scriptPaper);
  const tercihDili = useUiStore((s) => s.scriptLang);
  /* BELGENİN kendi dili varsa tercihi EZİYOR: fon başvuru dosyasında dil
     kurumun şartıdır, yazarın tercihi değil. Ezmeseydi Eurimages dosyası
     Türkçe büyütme kuralıyla basılırdı (ölçüldü: `SYNOPSİS — ENGLİSH`). */
  const belgeDili = useProjectStore((s) => s.project.settings.belgeDili);
  const presetler = useUiStore((s) => s.scriptPresetler);
  const yaziAdi = useUiStore((s) => s.scriptYazi);
  const solSutun = useUiStore((s) => s.scriptSolSutun);
  /* Tip BELGEDEN okunuyor, arayüz durumundan değil: doküman tipi projenin
     bir özelliği, o oturumun tercihi değil. Ortak çalışan da aynı tipi
     görmeli. */
  const tipAdi = useProjectStore((s) => s.project.meta.dokumanTipi);

  return useMemo(
    () => senaryoProfiliKur({ tipAdi, belgeDili, kagit, tercihDili, presetler, yaziAdi, solSutun }),
    [kagit, belgeDili, tercihDili, presetler, tipAdi, yaziAdi, solSutun],
  );
}
