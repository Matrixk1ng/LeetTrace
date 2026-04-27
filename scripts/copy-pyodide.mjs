import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', 'node_modules', 'pyodide');
const dest = join(__dirname, '..', 'public', 'pyodide');

const FILES = [
  'pyodide.mjs',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

if (!existsSync(src)) {
  console.error('[copy-pyodide] node_modules/pyodide not found — run `npm install` first.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log(`[copy-pyodide] copied ${FILES.length} files → public/pyodide/`);
