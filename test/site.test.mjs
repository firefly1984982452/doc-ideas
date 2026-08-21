import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { categorize, collectEntries, createDataset, createSlugger } from '../scripts/generate-ideas-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Docsify-compatible slugs preserve Chinese and disambiguate duplicates', () => {
  const slugify = createSlugger();
  assert.equal(slugify('1 月'), '_1-月');
  assert.equal(slugify('1 月'), '_1-月-1');
  assert.equal(slugify('你好，世界！'), '你好，世界！');
});

test('content categories follow the idea archive model', () => {
  assert.equal(categorize('docs/letter/2025to2016.md', '写给自己'), '写给自己的信');
  assert.equal(categorize('docs/idea/2026年的只言片语.md', '2026 年的只言片语'), '年度片语');
  assert.equal(categorize('docs/idea/2021年月总结.md', '月总结'), '成长记录');
  assert.equal(categorize('docs/idea/朝梦夕拾.md', '朝梦夕拾'), '灵感收藏');
});

test('generated data matches the current Markdown collection', async () => {
  const expected = createDataset(await collectEntries());
  const actual = JSON.parse(await readFile(path.join(ROOT, 'assets/data/ideas-data.json'), 'utf8'));
  assert.deepEqual(actual, expected);
  assert.ok(actual.summary.entries >= 30);
  assert.equal(actual.summary.firstYear, 2016);
  assert.ok(actual.entries.every((entry) => entry.route.startsWith('/docs/')));
});
