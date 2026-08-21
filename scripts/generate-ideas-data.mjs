import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const OUTPUT = path.join(ROOT, 'assets/data/ideas-data.json');
const EXCLUDED = new Set(['docs/archive.md', 'docs/demo.md', 'docs/think/test.md']);

async function walk(directory) {
  const values = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(values.map(async (value) => {
    const target = path.join(directory, value.name);
    return value.isDirectory() ? walk(target) : [target];
  }));
  return files.flat();
}

export function stripMarkdown(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_~>|#]/g, ' ')
    .replace(/^\s*(?:[-+]|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createSlugger() {
  const cache = new Map();
  const punctuation = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g;
  return function slugify(value) {
    let slug = String(value || '')
      .trim()
      .replace(/[A-Z]+/g, (match) => match.toLowerCase())
      .replace(/<[^>]+>/g, '')
      .replace(punctuation, '')
      .replace(/\s/g, '-')
      .replace(/-+/g, '-')
      .replace(/^(\d)/, '_$1');
    const count = cache.has(slug) ? cache.get(slug) + 1 : 0;
    cache.set(slug, count);
    if (count) slug += `-${count}`;
    return slug;
  };
}

export function categorize(relativePath, title) {
  if (relativePath.startsWith('docs/letter/')) return '写给自己的信';
  if (/年的只言片语/.test(`${relativePath} ${title}`)) return '年度片语';
  if (/(?:年历|月总结|每日技术学习|训练计划|减肥知识)/.test(`${relativePath} ${title}`)) return '成长记录';
  if (relativePath.startsWith('docs/idea/')) return '灵感收藏';
  return '关于';
}

function firstExcerpt(lines) {
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line) || /^\s*<\/?(?:div|img)/i.test(line)) continue;
    const value = stripMarkdown(line);
    if (value.length >= 2) return value.slice(0, 120);
  }
  return '';
}

function sectionsFrom(lines) {
  const slugify = createSlugger();
  const sections = [];
  let current = null;

  lines.forEach((line) => {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const title = stripMarkdown(heading[2]);
      const id = slugify(heading[2]);
      current = heading[1].length >= 2 ? { title, id, level: heading[1].length, excerpt: '' } : null;
      if (current) sections.push(current);
      return;
    }
    if (!current || current.excerpt.length >= 84) return;
    const value = stripMarkdown(line);
    if (!value) return;
    current.excerpt = `${current.excerpt} ${value}`.trim().slice(0, 84);
  });

  return sections;
}

function characterCount(source) {
  return Array.from(stripMarkdown(source).replace(/\s/g, '')).length;
}

export async function collectEntries() {
  const files = (await walk(DOCS_DIR))
    .filter((file) => file.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));

  const entries = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (EXCLUDED.has(relative) || relative.startsWith('docs/think/')) continue;
    const source = await readFile(file, 'utf8');
    const lines = source.split(/\r?\n/);
    const heading = lines.find((line) => /^#\s+/.test(line));
    const title = heading ? stripMarkdown(heading.replace(/^#\s+/, '')) : path.basename(file, '.md');
    const yearMatch = `${path.basename(file)} ${title}`.match(/(?:19|20)\d{2}/);
    const characters = characterCount(source);
    entries.push({
      title,
      route: `/${relative.replace(/\.md$/, '')}`,
      file: relative,
      category: categorize(relative, title),
      year: yearMatch ? Number(yearMatch[0]) : null,
      characters,
      minutes: Math.max(1, Math.ceil(characters / 500)),
      excerpt: firstExcerpt(lines),
      sections: sectionsFrom(lines)
    });
  }

  const categoryOrder = ['年度片语', '写给自己的信', '成长记录', '灵感收藏'];
  entries.sort((left, right) =>
    Number(right.year || 0) - Number(left.year || 0) ||
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.title.localeCompare(right.title, 'zh-CN'));
  return entries;
}

export function createDataset(entries) {
  const yearsMap = new Map();
  const categoryMap = new Map();
  entries.forEach((entry) => {
    if (entry.year) yearsMap.set(entry.year, (yearsMap.get(entry.year) || 0) + 1);
    categoryMap.set(entry.category, (categoryMap.get(entry.category) || 0) + 1);
  });
  const years = Array.from(yearsMap, ([year, count]) => ({ year, count })).sort((left, right) => left.year - right.year);
  const categories = Array.from(categoryMap, ([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));

  return {
    schemaVersion: 1,
    summary: {
      entries: entries.length,
      firstYear: years[0]?.year || null,
      lastYear: years.at(-1)?.year || null,
      totalCharacters: entries.reduce((total, entry) => total + entry.characters, 0),
      letters: entries.filter((entry) => entry.category === '写给自己的信').length
    },
    years,
    categories,
    entries
  };
}

export async function generate() {
  const dataset = createDataset(await collectEntries());
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset)}\n`);
  return dataset;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const dataset = await generate();
  console.log(`Generated ${dataset.summary.entries} entries, ${dataset.summary.totalCharacters.toLocaleString('zh-CN')} characters.`);
}
