/**
 * Güvenlik kapılarının MUTASYON denetimi.
 *
 * Her kapı tek tek sökülüyor ve testin KIRMIZI döndüğü doğrulanıyor.
 * Ölmeyen mutant = işe yaramaz güvenlik. Betik kaynağı değiştirip GERİ ALIR;
 * çıkışta dosyalar olduğu gibi kalır (yedek `.mutasyon-yedek/` altında).
 *
 * Kullanım: node tools/mutasyon-guvenlik.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const KOK = path.resolve(import.meta.dirname, '..');
const YEDEK = path.join(KOK, '.mutasyon-yedek');

const MUTANTLAR = [
  {
    ad: 'M1 tek kullanımlık davet sınırı SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: 'if (invite.kullanim >= invite.kullanimSiniri) {',
    yaz: 'if (false) {',
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M2 hız sınırı SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: '      const karar = hizlar[ad].bak(`${ad}:${istemciAdresi(req, vekilGuvenilir)}`);',
    yaz: '      const karar = { ok: true, yenidenDeneSn: 0 };',
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M3 güvenlik başlıkları SÖKÜLDÜ',
    dosya: 'apps/server/src/guvenlik.ts',
    bul: "  'x-content-type-options': 'nosniff',",
    yaz: '',
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M4 WebSocket kimlik kapısı SÖKÜLDÜ (her soket kabul)',
    dosya: 'apps/server/src/server.ts',
    bul: '    const auth = authenticate(room, token);\n    if (!auth) {',
    yaz: "    const auth = { payload: { jti: 'sahte' }, role: 'owner' } as any;\n    if (false) {",
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M5 bağlantı sınırı SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: '    if (!baglantilar.ac(adres)) {',
    yaz: '    if (false) {',
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M6 parola karşılaştırması SÖKÜLDÜ (her parola doğru)',
    dosya: 'apps/server/src/hesaplar.ts',
    bul: '  return aday.length === hesap.hash.length && crypto.timingSafeEqual(aday, hesap.hash);',
    yaz: '  return aday.length === hesap.hash.length;',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M7 jeton SÜRE denetimi SÖKÜLDÜ',
    dosya: 'apps/server/src/tokens.ts',
    bul: "    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;",
    yaz: "    if (!payload || typeof payload.exp !== 'number') return null;",
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M8 hesap zorunluluğu (oda açma) SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: "hesapZorunlu && !hesap) {\n        return reply.code(401).send({ error: 'Oturum açmak",
    yaz: "false) {\n        return reply.code(401).send({ error: 'Oturum açmak",
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M9 hesap zorunluluğu (katılma) SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: "hesapZorunlu && !hesap) {\n      return reply.code(401).send({ error: 'Odaya katılmak",
    yaz: "false) {\n      return reply.code(401).send({ error: 'Odaya katılmak",
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M10 davetin HESABA bağlılığı SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: '      if (invite.eposta) {',
    yaz: '      if (false) {',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M11 yenileme jetonu DÖNDÜRME SÖKÜLDÜ (tekrar kullanılabilir)',
    dosya: 'apps/server/src/server.ts',
    bul: '      if (!hesap || !hesap.yenilemeler.delete(payload.jti)) {',
    yaz: '      if (!hesap || !hesap.yenilemeler.has(payload.jti)) {',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M12 hesap jetonu ODA jetonu sayılıyor (tür kapısı SÖKÜLDÜ)',
    dosya: 'apps/server/src/server.ts',
    bul: "    if (payload.kind !== 'invite' && payload.kind !== 'session') return null;",
    yaz: '',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M13 rol YAPIŞIKLIĞI SÖKÜLDÜ (davet rolü kazanıyor)',
    dosya: 'apps/server/src/server.ts',
    bul: '    const role: Role = room.users.get(userId)?.role ?? tokenRole;',
    yaz: '    const role: Role = tokenRole;',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M14 kullanıcı sayımı korumasi SÖKÜLDÜ (sahte doğrulama yok)',
    dosya: 'apps/server/src/server.ts',
    bul: "      if (!hesap || !dogru) return reply.code(401).send({ error: 'E-posta ya da parola hatalı.' });",
    yaz: "      if (!hesap) return reply.code(404).send({ error: 'Böyle bir hesap yok.' });\n      if (!dogru) return reply.code(401).send({ error: 'Parola hatalı.' });",
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M15 sayı sınırı şeması SÖKÜLDÜ (davet sınırı uydurulabiliyor)',
    dosya: 'apps/server/src/server.ts',
    bul: "            kullanimSiniri: { type: 'integer', minimum: 1, maximum: 50 },",
    yaz: "            kullanimSiniri: { type: 'integer' },",
    test: 'tests/guvenlik.test.ts',
  },
  {
    ad: 'M17 katılma yolundaki jeton TÜRÜ kapısı SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: "    if (payload.kind !== 'invite' && payload.kind !== 'session') {\n      return reply.code(401).send({ error: 'Davet geçersiz ya da süresi dolmuş.' });\n    }",
    yaz: '',
    test: 'tests/hesap.test.ts',
  },
  {
    ad: 'M16 yol parametresi deseni SÖKÜLDÜ',
    dosya: 'apps/server/src/server.ts',
    bul: "const KIMLIK = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' } as const;",
    yaz: "const KIMLIK = { type: 'string' } as const;",
    test: 'tests/guvenlik.test.ts',
  },
];

fs.rmSync(YEDEK, { recursive: true, force: true });
fs.mkdirSync(YEDEK, { recursive: true });
const dosyalar = [...new Set(MUTANTLAR.map((m) => m.dosya))];
for (const d of dosyalar) {
  fs.writeFileSync(path.join(YEDEK, d.replace(/[\\/]/g, '_')), fs.readFileSync(path.join(KOK, d)));
}
const geriAl = () => {
  for (const d of dosyalar) {
    fs.writeFileSync(path.join(KOK, d), fs.readFileSync(path.join(YEDEK, d.replace(/[\\/]/g, '_'))));
  }
};
process.on('exit', geriAl);
process.on('SIGINT', () => process.exit(1));

const sonuc = [];
for (const m of MUTANTLAR) {
  geriAl();
  const yol = path.join(KOK, m.dosya);
  const asil = fs.readFileSync(yol, 'utf8');
  if (!asil.includes(m.bul)) {
    sonuc.push(`${m.ad}: ⚠ HEDEF BULUNAMADI — mutant uygulanamadı`);
    continue;
  }
  fs.writeFileSync(yol, asil.replace(m.bul, m.yaz));
  let oldu = false;
  try {
    execSync(`npx vitest run ${m.test} --reporter=dot`, { cwd: KOK, stdio: 'pipe' });
  } catch {
    oldu = true; // test kırmızı → mutant öldü
  }
  sonuc.push(`${m.ad}: ${oldu ? 'ÖLDÜ ✓' : 'HAYATTA ✗ (test bu kapıyı ölçmüyor)'}`);
  console.log(sonuc.at(-1));
}
geriAl();
console.log('\n--- ÖZET ---');
console.log(sonuc.join('\n'));
const hayatta = sonuc.filter((s) => s.includes('HAYATTA') || s.includes('BULUNAMADI'));
console.log(`\n${MUTANTLAR.length - hayatta.length}/${MUTANTLAR.length} mutant öldü.`);
process.exit(hayatta.length ? 1 : 0);
