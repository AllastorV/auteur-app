/**
 * Kitaplığın sol rafındaki söz.
 *
 * Story Architect ana ekranında yazar sözü tutuyor; aynı fikri alıyoruz ama
 * sözler BU uygulamanın kimliğine göre seçildi: kurgu masası, kesme, zaman.
 *
 * Söz GÜNE göre seçiliyor, rastgele değil. Rastgele olsaydı her yeniden
 * çizimde değişirdi — kullanıcı okurken cümlenin altından kayardı — ve
 * testler de kararsız olurdu.
 */
/**
 * Sözler İKİ DİLDE.
 *
 * Kullanıcı sorusu (2026-08-27): "bu sözlerin İngilizce versiyonu var
 * değil mi?" — YOKTU. Arayüz İngilizce açılıyor ama karşılama ekranındaki
 * tek uzun metin Türkçe kalıyordu; ilk izlenimi yarım bırakan bir eksik.
 *
 * Sözlerin çoğu zaten İngilizce dolaşımda; burada uydurma çeviri değil,
 * yerleşik karşılıkları duruyor.
 */
export interface Soz {
  /** Türkçe metin. */
  metin: string;
  /** İngilizce karşılık — arayüz dili İngilizceyken kullanılır. */
  en: string;
  kim: string;
}

export const SOZLER: readonly Soz[] = [
  { metin: 'Sinema, saniyede yirmi dört kare hakikattir.', en: 'Cinema is truth twenty-four times per second.', kim: 'Jean-Luc Godard' },
  { metin: 'Kurgu, filmin ikinci kez yazılmasıdır.', en: 'Editing is the second writing of the film.', kim: 'Walter Murch' },
  { metin: 'Bir sahne çalışmıyorsa, sorun genellikle bir önceki sahnededir.', en: 'If a scene does not work, the trouble is usually in the scene before it.', kim: 'Billy Wilder' },
  { metin: 'Yazmak yeniden yazmaktır. Gerisi daktilo gürültüsüdür.', en: 'Books are not written — they are rewritten. The rest is typing.', kim: 'Michael Crichton' },
  { metin: 'Filmi üç kez yaparsınız: yazarken, çekerken, keserken.', en: 'You make a film three times: when you write it, when you shoot it, when you cut it.', kim: 'David Lean' },
  { metin: 'Sanat asla bitmez, yalnızca terk edilir.', en: 'Art is never finished, only abandoned.', kim: 'Leonardo da Vinci' },
  { metin: 'Geç gir, erken çık.', en: 'Come in late, leave early.', kim: 'William Goldman' },
  { metin: 'Zaman heykeltıraşlığı — sinemacının işi budur.', en: 'Sculpting in time — that is the filmmaker’s work.', kim: 'Andrey Tarkovski' },
  { metin: 'Karakter kaderdir; olay örgüsü yalnızca onun bıraktığı izdir.', en: 'Character is destiny; plot is only the trace it leaves.', kim: 'Herakleitos' },
  { metin: 'İlk taslak yalnızca kumun kovaya doldurulmasıdır.', en: 'The first draft is just you shovelling sand into a box.', kim: 'Shannon Hale' },
  { metin: 'Yazdığınız her sayfa bir dakikadır. Seyircinin bir dakikası.', en: 'Every page you write is one minute — one minute of the audience’s life.', kim: 'Syd Field' },
  { metin: 'Gösterme fırsatın varken anlatma.', en: 'Don’t tell me the moon is shining; show me the glint of light on broken glass.', kim: 'Anton Çehov' },
];

/**
 * Günün sözü. `gun` verilmezse bugün — testler kendi gününü verebilsin diye
 * parametre var, `Date.now()` çağrısı gövdeye gömülü değil.
 */
export function gununSozu(gun: number = Math.floor(Date.now() / 86_400_000)): Soz {
  return SOZLER[((gun % SOZLER.length) + SOZLER.length) % SOZLER.length];
}

/** Sözün ARAYÜZ DİLİNDEKİ metni. */
export function sozMetni(soz: Soz, dil: string): string {
  return dil === 'tr' ? soz.metin : soz.en;
}
