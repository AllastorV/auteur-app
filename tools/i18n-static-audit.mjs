// i18n static audit — complements packages/core/tests/i18n-kapsam.test.ts, which only
// scans .tsx literals. This one also reads .ts sources and template literals, and
// lists t()/tf() keys that have no English entry.
//   node tools/i18n-static-audit.mjs   -> test-results/i18n-audit/static.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'i18n-audit');
fs.mkdirSync(OUT, { recursive: true });
// Import the dictionary itself (Node strips TS types) — regex parsing missed single-quoted keys.
const { EN: DICT } = await import(new URL('../packages/core/src/dil/arayuz.ts', import.meta.url));
const EN = new Set(Object.keys(DICT));
const TR = /[çğıöşüÇĞİÖŞÜ]/;

const roots = ['packages/core/src', 'apps/web/src', 'apps/desktop/src', 'apps/desktop/electron', 'apps/server/src'].map((p) => path.join(ROOT, p));
const files = [];
const walk = (d) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) files.push(p); } };
roots.forEach(walk);

const missing = new Map();   // t()/tf() key without EN entry
const literals = [];         // Turkish literal outside t()/tf()
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.endsWith('dil/arayuz.ts')) continue;
  const src = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
  for (const m of src.matchAll(/\b(t|tf)\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g)) {
    const key = m[3].replace(/\\(['"`\\])/g, '$1'); // source escapes (\') are not part of the key
    if (m[2] === '`' && key.includes('${')) continue;
    if (!EN.has(key)) {
      const line = src.slice(0, m.index).split('\n').length;
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(`${rel}:${line}`);
    }
  }
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const stripped = ln.replace(/\b(t|tf|ceviri)\(\s*(['"`])(?:(?!\2)[^\\]|\\.)*\2/g, '');
    for (const m of stripped.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){2,120})\1/g)) {
      if (TR.test(m[2])) literals.push({ at: `${rel}:${i + 1}`, text: m[2] });
    }
    // JSX text between tags on the same line
    for (const m of stripped.matchAll(/>([^<>{}\n]*[çğıöşüÇĞİÖŞÜ][^<>{}\n]*)</g)) literals.push({ at: `${rel}:${i + 1}`, text: m[1].trim(), jsx: true });
  });
}
const report = { missingEnglish: [...missing].map(([key, at]) => ({ key, at })), turkishLiterals: literals };
fs.writeFileSync(path.join(OUT, 'static.json'), JSON.stringify(report, null, 2));
console.log(`files ${files.length}, missing EN keys ${report.missingEnglish.length}, Turkish literals ${literals.length}`);
const byFile = {};
for (const l of literals) { const f = l.at.split(':')[0]; byFile[f] = (byFile[f] || 0) + 1; }
console.log(Object.entries(byFile).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n}\t${f}`).join('\n'));
