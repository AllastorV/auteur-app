/**
 * Çizim kalitesi.
 *
 * `fast` küçük resimlerde kullanılır: ayrıntı yerine hız. Ayrı bir modülde
 * çünkü hem tuval hem dışa aktarım okuyor ve ikisi de birbirini import
 * etmemeli.
 */
export type RenderQuality = 'full' | 'fast';
