import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/ideas.js', import.meta.url), 'utf8');
const route2026 = '/docs/idea/2026年的只言片语';
const route2028 = '/docs/idea/2028年的只言片语';

function createFixture(route) {
  const documentListeners = new Map();
  const diagnostics = { dataRequests: 0, dataErrors: 0 };
  let resolveDataset;
  const datasetPromise = new Promise((resolve) => { resolveDataset = resolve; });

  function node(initialHidden = false) {
    const attributes = new Map();
    const listeners = new Map();
    const hiddenWrites = [];
    let hidden = initialHidden;
    return {
      dataset: {},
      currentEntry: null,
      hiddenWrites,
      get hidden() { return hidden; },
      set hidden(value) { hidden = value; hiddenWrites.push(value); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      addEventListener(name, callback) { listeners.set(name, callback); },
      classList: { add() {}, remove() {} }
    };
  }

  const tools = node(true);
  const favorite = node();
  const copy = node();
  const random = node();
  let calendar = null;
  tools.querySelector = (selector) => selector === '.diary-calendar-control' ? calendar : null;
  const nodes = new Map([
    ['idea-tools', tools],
    ['favorite-idea', favorite],
    ['copy-idea-link', copy],
    ['random-idea', random],
    ['idea-toast', node(true)]
  ]);
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '.data-loading') diagnostics.dataErrors += 1;
      return [];
    },
    addEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      callbacks.push(callback);
      documentListeners.set(name, callbacks);
    },
    dispatchEvent(event) {
      for (const callback of documentListeners.get(event.type) || []) callback(event);
    }
  };
  const window = {
    location: { hash: '#' + route, href: 'http://localhost/#' + route },
    localStorage: { getItem() { return '[]'; }, setItem() {} },
    DocIdeasResources: {
      json() { diagnostics.dataRequests += 1; return datasetPromise; }
    },
    addEventListener() {},
    clearTimeout,
    setTimeout
  };
  vm.runInNewContext(source, { document, window }, { filename: 'ideas.js' });
  assert.equal(typeof window.DocIdeas.refreshArticleTools, 'function');

  return {
    tools,
    favorite,
    window,
    diagnostics,
    refresh() { window.DocIdeas.refreshArticleTools(); },
    setCalendar(calendarRoute) {
      calendar = calendarRoute ? { dataset: { diaryRoute: calendarRoute } } : null;
    },
    render() { document.dispatchEvent({ type: 'doc-ideas:rendered' }); },
    resolveDataset
  };
}

test('indexed article shows its toolbar and favorite button', () => {
  const fixture = createFixture(encodeURI(route2026) + '.md?id=some-day');
  const entry = { route: route2026, title: '2026 年的只言片语' };
  fixture.favorite.currentEntry = entry;
  fixture.favorite.hidden = true;

  fixture.refresh();

  assert.equal(fixture.tools.hidden, false);
  assert.equal(fixture.favorite.hidden, false);
  assert.equal(fixture.favorite.currentEntry, entry);
});

test('future diary without an index entry keeps its calendar toolbar visible', () => {
  const fixture = createFixture(route2028);
  fixture.setCalendar(route2028);

  fixture.refresh();
  fixture.refresh();

  assert.equal(fixture.tools.hidden, false);
  assert.equal(fixture.favorite.hidden, true);
  assert.equal(fixture.favorite.currentEntry, null);
});

test('late index resolution does not hide an unindexed future diary calendar', async () => {
  const fixture = createFixture(route2028);
  fixture.render();
  assert.equal(fixture.diagnostics.dataRequests, 1);

  fixture.setCalendar(route2028);
  fixture.refresh();
  const writesBeforeData = fixture.tools.hiddenWrites.length;
  fixture.resolveDataset({
    entries: [{ route: route2026, title: '2026 年的只言片语', category: '年度片语' }],
    summary: { firstYear: 2016, lastYear: 2026 },
    years: []
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fixture.diagnostics.dataErrors, 0, 'the real asynchronous mount must complete');
  assert.ok(fixture.tools.hiddenWrites.length > writesBeforeData, 'the data callback must refresh visibility');
  assert.equal(fixture.tools.hidden, false);
  assert.equal(fixture.favorite.hidden, true);
  assert.equal(fixture.favorite.currentEntry, null);
});

test('route changes ignore an old calendar and clear the previous favorite target', () => {
  const fixture = createFixture(route2026);
  fixture.favorite.currentEntry = { route: route2026 };
  fixture.setCalendar(route2026);
  fixture.refresh();

  fixture.window.location.hash = '#' + route2028;
  fixture.refresh();

  assert.equal(fixture.tools.hidden, true);
  assert.equal(fixture.favorite.hidden, true);
  assert.equal(fixture.favorite.currentEntry, null);

  fixture.setCalendar(route2028);
  fixture.refresh();
  assert.equal(fixture.tools.hidden, false);

  fixture.window.location.hash = '#/docs/archive';
  fixture.refresh();
  assert.equal(fixture.tools.hidden, true);
  assert.equal(fixture.favorite.hidden, true);
  assert.equal(fixture.favorite.currentEntry, null);
});

test('removing the only calendar hides an otherwise empty toolbar', () => {
  const fixture = createFixture(route2028);
  fixture.setCalendar(route2028);
  fixture.refresh();
  assert.equal(fixture.tools.hidden, false);

  fixture.setCalendar(null);
  fixture.refresh();

  assert.equal(fixture.tools.hidden, true);
  assert.equal(fixture.favorite.hidden, true);
  assert.equal(fixture.favorite.currentEntry, null);
});
