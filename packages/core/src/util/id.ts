const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

/** Kısa, çakışma olasılığı düşük kimlik. */
export function nanoid(size = 12): string {
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

export function uid(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

/** İnsan tarafından okunabilir 6 haneli oda kodu (örn. "K3M-9QP"). */
export function roomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  const s = Array.from(b, (v) => A[v % A.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}
