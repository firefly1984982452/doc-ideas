import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function exists(relative) {
  try {
    await access(path.join(ROOT, relative));
    return true;
  } catch {
    return false;
  }
}

function markdownTargets(source) {
  return Array.from(source.matchAll(/\[[^\]]*\]\((\/[^)]+)\)/g), (match) => match[1]);
}

for (const file of ['_sidebar.md', '_navbar.md', '_coverpage.md', 'README.md', '404.md']) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  for (const target of markdownTargets(source)) {
    const clean = decodeURIComponent(target.split(/[?#]/)[0]);
    const relative = clean === '/' ? 'README.md' : clean.replace(/^\//, '').replace(/\.md$/, '') + '.md';
    if (!await exists(relative)) failures.push(`${file}: missing ${target}`);
  }
}

const index = await readFile(path.join(ROOT, 'index.html'), 'utf8');
for (const match of index.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^"#]*)?"/g)) {
  if (!await exists(match[1])) failures.push(`index.html: missing local asset ${match[1]}`);
}

if (/doc-idea(?:\.git|\/)/.test(index)) failures.push('index.html: legacy singular doc-idea URL remains');
if (!/lang="zh-CN"/.test(index)) failures.push('index.html: document language must be zh-CN');
if (!await exists('assets/data/ideas-data.json')) failures.push('generated ideas data is missing; run npm run generate');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Site checks passed.');
}
