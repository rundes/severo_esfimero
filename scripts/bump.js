#!/usr/bin/env node
/*
 * scripts/bump.js — single source of truth para la versión de la app.
 *
 * version.json es la fuente. Este script propaga ese valor a:
 *   - js/app.js          → APP_VERSION
 *   - severo.html        → APP_VERSION (build monolítico)
 *   - index.html         → BUILD (IIFE que adjunta ?_v= a los scripts)
 *   - sw.js              → CACHE = 'severo-vX.Y.Z'
 *
 * Uso:
 *   node scripts/bump.js patch      # 2.8.9 → 2.8.10
 *   node scripts/bump.js minor      # 2.8.9 → 2.9.0
 *   node scripts/bump.js major      # 2.8.9 → 3.0.0
 *   node scripts/bump.js 3.1.4      # versión explícita
 *   node scripts/bump.js            # solo re-propaga la versión actual
 *                                   # (útil si version.json se editó a mano)
 *
 * No commitea ni pushea: solo escribe los archivos. El usuario decide
 * cuándo hacer el commit + deploy.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'version.json');

const TARGETS = [
  {
    file: 'js/app.js',
    pattern: /const APP_VERSION = '[\d.]+';/,
    replace: (v) => `const APP_VERSION = '${v}';`,
  },
  {
    file: 'severo.html',
    pattern: /const APP_VERSION = '[\d.]+';/,
    replace: (v) => `const APP_VERSION = '${v}';`,
  },
  {
    file: 'index.html',
    pattern: /var BUILD = '[\d.]+';/,
    replace: (v) => `var BUILD = '${v}';`,
  },
  {
    file: 'sw.js',
    pattern: /const CACHE = 'severo-v[\d.]+';/,
    replace: (v) => `const CACHE = 'severo-v${v}';`,
  },
];

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, c) { fs.writeFileSync(p, c); }

function currentVersion() {
  return JSON.parse(read(VERSION_FILE)).version;
}

function bump(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`bump kind desconocido: '${kind}'. Usá patch/minor/major o X.Y.Z explícito.`);
}

function main() {
  const arg = process.argv[2];
  const current = currentVersion();
  const next = arg ? bump(current, arg) : current;

  if (arg && next !== current) {
    write(VERSION_FILE, JSON.stringify({ version: next }) + '\n');
    console.log(`version.json: ${current} → ${next}`);
  } else if (arg && next === current) {
    console.log(`version.json: ya está en ${current} (no-op)`);
  } else {
    console.log(`version.json: ${current} (sin bump, solo propagación)`);
  }

  const errors = [];
  for (const t of TARGETS) {
    const full = path.join(ROOT, t.file);
    const before = read(full);
    if (!t.pattern.test(before)) {
      errors.push(`✗ ${t.file}: patrón no encontrado (${t.pattern})`);
      continue;
    }
    const after = before.replace(t.pattern, t.replace(next));
    if (after === before) {
      console.log(`  ${t.file}: sin cambios`);
    } else {
      write(full, after);
      console.log(`  ${t.file}: actualizado a ${next}`);
    }
  }

  if (errors.length) {
    console.error('\nErrores:');
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }

  console.log(`\nListo. Versión propagada: v${next}`);
  console.log('Próximos pasos: revisar el diff (git diff), commitear, push y deploy a gh-pages.');
}

main();
