import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { categorize, collectEntries, createDataset, createSlugger } from '../scripts/generate-ideas-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Docsify preserves authored single line breaks', async () => {
  const [index, site, styles] = await Promise.all([
    readFile(path.join(ROOT, 'index.html'), 'utf8'),
    readFile(path.join(ROOT, 'assets/js/site.js'), 'utf8'),
    readFile(path.join(ROOT, 'assets/css/blog-docsify.css'), 'utf8')
  ]);
  assert.match(index, /markdown:\s*\{\s*breaks:\s*true\s*\}/);
  assert.match(site, /node\.nodeName === 'BR'/);
  assert.match(site, /line\.className = 'authored-line'/);
  assert.match(styles, /> \.authored-line\s*\{[^}]*display:\s*block;[^}]*text-indent:\s*2em;/s);
});

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

test('diary calendar recognizes future year routes and real heading variants', async () => {
  const source = await readFile(path.join(ROOT, 'assets/js/diary-calendar.js'), 'utf8');
  const browserWindow = {
    addEventListener() {},
    clearTimeout() {},
    location: { hash: '#/' },
    setTimeout() {}
  };
  const browserDocument = { addEventListener() {} };
  vm.runInNewContext(source, {
    Array,
    Date,
    Map,
    Number,
    RegExp,
    String,
    URLSearchParams,
    decodeURIComponent,
    document: browserDocument,
    encodeURIComponent,
    window: browserWindow
  });

  const calendar = browserWindow.DocIdeasDiaryCalendar;
  assert.equal(calendar.diaryYearFromRoute('/docs/idea/2015年的只言片语'), null);
  assert.equal(calendar.diaryYearFromRoute('/docs/idea/2028年的只言片语'), 2028);
  assert.equal(calendar.diaryYearFromRoute('/docs/idea/2028年月总结'), null);

  const heading = (tagName, id, textContent) => ({
    id,
    tagName,
    cloneNode() {
      return { querySelectorAll: () => [], textContent };
    }
  });
  const headings = [
    heading('H2', '_8月', '8月'),
    heading('H3', 'weekday-entry', '【周一】8月21日所做事项'),
    heading('H3', 'full-entry', '2028年08月21日'),
    heading('H2', '_9月第1周', '9月第1周'),
    heading('H3', 'august-last-day', '31号'),
    heading('H3', 'september-first-day', '1号'),
    heading('H3', 'weekly-summary', '4月第3、4周（17-30）')
  ];
  const records = calendar.collectDiaryDates({ querySelectorAll: () => headings }, 2028);
  const recordAt = (month, day) => records.find((record) => record.month === month && record.day === day);

  assert.equal(recordAt(8, 21).id, 'full-entry');
  assert.equal(recordAt(8, 21).count, 2);
  assert.equal(recordAt(8, 31).id, 'august-last-day');
  assert.equal(recordAt(9, 1).id, 'september-first-day');
  assert.equal(records.some((record) => record.id === 'weekly-summary'), false);
});
