/**
 * Tarayıcı indirmesi — masaüstünde kabuk kaydediyor, web'de bu.
 *
 * ## Neden `ExportDialog`ten TAŞINDI
 *
 * Üç çağıranı vardı ve hepsi onu dışa aktarım penceresinden alıyordu; o
 * pencere ise storyboard çiziciyi (ve dolayısıyla `konva`yı) içeri
 * çekiyor. Altı satırlık bir yardımcı için bütün bir tuval yığınını
 * yüklemek hem paket boyutunda hem test ortamında bedel ödetiyordu
 * (fon paneli testi `Cannot find module 'canvas'` ile düşüyordu).
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  /* URL HEMEN İPTAL EDİLMİYOR: bazı tarayıcılar tıklamayı asenkron
     işliyor ve anında iptal edilen bir blob indirmesi sessizce boş
     dosya üretiyor. */
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
