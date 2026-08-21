(function (global) {
  'use strict';

  var DATA_PATH = 'assets/data/ideas-data.json';
  var FAVORITES_KEY = 'doc-ideas:favorites';
  var dataPromise = null;
  var toast = document.getElementById('idea-toast');
  var tools = document.getElementById('idea-tools');
  var favoriteButton = document.getElementById('favorite-idea');
  var copyButton = document.getElementById('copy-idea-link');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function data() {
    if (!dataPromise) dataPromise = global.DocIdeasResources.json(DATA_PATH, { attempts: 3 });
    return dataPromise;
  }

  function normalizeRoute(value) {
    var route = String(value || '').split('?')[0].replace(/^#/, '');
    try { route = decodeURIComponent(route); } catch (error) { /* Keep encoded route. */ }
    if (!route || route === '/') return '/';
    if (route.charAt(0) !== '/') route = '/' + route;
    return route.replace(/\.md$/, '');
  }

  function currentRoute() {
    return normalizeRoute(global.location.hash || '#/');
  }

  function entryHref(entry, sectionId) {
    return '#' + entry.route + (sectionId ? '?id=' + encodeURIComponent(sectionId) : '');
  }

  function readFavorites() {
    try {
      var value = JSON.parse(global.localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(value) ? value.filter(function (item) { return item && item.route; }) : [];
    } catch (error) {
      return [];
    }
  }

  function saveFavorites(favorites) {
    try { global.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }
    catch (error) { showToast('当前浏览器无法保存收藏', 'error'); }
  }

  function isFavorite(route) {
    return readFavorites().some(function (item) { return item.route === route; });
  }

  function favoriteRecord(entry) {
    return { route: entry.route, title: entry.title, category: entry.category, year: entry.year || null };
  }

  function toggleFavorite(entry, options) {
    var favorites = readFavorites();
    var index = favorites.findIndex(function (item) { return item.route === entry.route; });
    var nextState = index < 0;
    if (nextState) favorites.unshift(favoriteRecord(entry));
    else favorites.splice(index, 1);
    saveFavorites(favorites);
    updateFavoriteButton(entry);
    if (!options || !options.quiet) showToast(nextState ? '已收藏到当前浏览器' : '已取消收藏');
    document.dispatchEvent(new CustomEvent('doc-ideas:favorites-changed'));
    return nextState;
  }

  function showToast(message, state) {
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.state = state || '';
    toast.hidden = false;
    global.clearTimeout(toast.docIdeasTimer);
    toast.docIdeasTimer = global.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function matchingEntry(dataset) {
    var route = currentRoute();
    return dataset.entries.find(function (entry) { return normalizeRoute(entry.route) === route; }) || null;
  }

  function updateFavoriteButton(entry) {
    if (!favoriteButton) return;
    var selected = Boolean(entry && isFavorite(entry.route));
    favoriteButton.setAttribute('aria-pressed', String(selected));
    favoriteButton.setAttribute('aria-label', selected ? '取消收藏这篇记录' : '收藏这篇记录');
    favoriteButton.dataset.tooltip = selected ? '取消收藏' : '收藏';
  }

  function mountArticleMeta(entry) {
    var article = document.querySelector('.markdown-section');
    var heading = article && article.querySelector('h1');
    if (!heading || article.querySelector('.article-meta')) return;
    var meta = document.createElement('p');
    meta.className = 'article-meta';
    meta.innerHTML = '<span>' + escapeHtml(entry.category) + '</span>' +
      (entry.year ? '<span>' + escapeHtml(entry.year) + '</span>' : '');
    heading.insertAdjacentElement('afterend', meta);
  }

  function mountArticleTools(dataset) {
    var entry = matchingEntry(dataset);
    if (!entry) {
      tools.hidden = true;
      favoriteButton.currentEntry = null;
      return;
    }
    tools.hidden = false;
    favoriteButton.currentEntry = entry;
    updateFavoriteButton(entry);
    mountArticleMeta(entry);
  }

  function formatCharacters(value) {
    if (value >= 10000) return (Math.round(value / 1000) / 10).toLocaleString('zh-CN') + ' 万';
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function mountArchiveYears(dataset) {
    document.querySelectorAll('[data-archive-start]').forEach(function (element) {
      element.textContent = dataset.summary.firstYear;
    });
    document.querySelectorAll('[data-archive-latest]').forEach(function (element) {
      element.textContent = dataset.summary.lastYear;
    });
  }

  function mountHomeStats(dataset) {
    var root = document.getElementById('idea-home-stats');
    if (!root) return;
    var yearSpan = Number(dataset.summary.lastYear) - Number(dataset.summary.firstYear) + 1;
    var metrics = [
      [dataset.summary.entries.toLocaleString('zh-CN'), '篇记录'],
      [yearSpan.toLocaleString('zh-CN'), '年时间跨度 · ' + dataset.summary.firstYear + '—' + dataset.summary.lastYear],
      [formatCharacters(dataset.summary.totalCharacters), '累计文字'],
      [dataset.summary.letters.toLocaleString('zh-CN'), '封时光书信']
    ];
    root.innerHTML = metrics.map(function (metric) {
      return '<div class="idea-metric"><strong>' + escapeHtml(metric[0]) + '</strong><small>' + escapeHtml(metric[1]) + '</small></div>';
    }).join('');
  }

  function mountRecent(dataset) {
    var root = document.getElementById('idea-recent-list');
    if (!root) return;
    root.innerHTML = dataset.entries.slice(0, 6).map(function (entry) {
      return '<a class="recent-idea" href="' + escapeHtml(entryHref(entry)) + '">' +
        '<span>' + escapeHtml(entry.year || '手札') + '</span>' +
        '<strong>' + escapeHtml(entry.title) + '</strong>' +
        '<small>' + escapeHtml(entry.category) + ' · ' + escapeHtml(entry.minutes) + ' 分钟</small>' +
        '</a>';
    }).join('');
  }

  function mountYearRiver(dataset) {
    var root = document.getElementById('idea-year-river');
    if (!root) return;
    var rows = dataset.years;
    var max = Math.max.apply(null, rows.map(function (row) { return row.count; }).concat([1]));
    root.style.setProperty('--year-count', rows.length);
    root.innerHTML = '<div class="year-river-bars">' + rows.map(function (row) {
      var height = Math.max(10, Math.round(row.count / max * 100));
      return '<button type="button" data-archive-year="' + escapeHtml(row.year) + '" aria-label="查看 ' + escapeHtml(row.year) + ' 年的 ' + escapeHtml(row.count) + ' 篇记录">' +
        '<span>' + escapeHtml(row.count) + '</span><i style="height:' + height + '%"></i><small>' + escapeHtml(row.year) + '</small></button>';
    }).join('') + '</div>';
    root.querySelectorAll('[data-archive-year]').forEach(function (button) {
      button.addEventListener('click', function () {
        global.location.hash = '#/docs/archive.md?year=' + encodeURIComponent(button.dataset.archiveYear);
      });
    });
  }

  function queryState() {
    var query = (global.location.hash || '').split('?')[1] || '';
    var params = new URLSearchParams(query);
    return {
      query: params.get('q') || '',
      category: params.get('category') || '全部',
      year: params.get('year') || '全部',
      favoritesOnly: params.get('favorites') === '1'
    };
  }

  function updateArchiveUrl(state) {
    var params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category !== '全部') params.set('category', state.category);
    if (state.year !== '全部') params.set('year', state.year);
    if (state.favoritesOnly) params.set('favorites', '1');
    var base = (global.location.hash || '#/docs/archive.md').split('?')[0];
    global.history.replaceState(null, '', base + (params.toString() ? '?' + params.toString() : ''));
  }

  function archiveItem(entry) {
    var selected = isFavorite(entry.route);
    return '<article class="archive-item">' +
      '<span class="archive-item-year">' + escapeHtml(entry.year || '手札') + '</span>' +
      '<div class="archive-item-main"><a href="' + escapeHtml(entryHref(entry)) + '">' + escapeHtml(entry.title) + '</a>' +
      '<p>' + escapeHtml(entry.excerpt || '打开这一页，继续阅读。') + '</p></div>' +
      '<div class="archive-item-side"><small>' + escapeHtml(entry.category) + ' · ' + escapeHtml(entry.minutes) + ' 分钟</small>' +
      '<button class="archive-favorite" type="button" aria-label="' + (selected ? '取消收藏' : '收藏') + '《' + escapeHtml(entry.title) + '》" aria-pressed="' + selected + '" data-favorite-route="' + escapeHtml(entry.route) + '">' +
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z" /></svg></button></div>' +
      '</article>';
  }

  function mountArchive(dataset) {
    var root = document.getElementById('ideas-archive');
    if (!root) return;
    var state = queryState();
    var categories = ['全部'].concat(dataset.categories.map(function (item) { return item.name; }));
    if (categories.indexOf(state.category) < 0) state.category = '全部';
    var years = dataset.years.slice().reverse();

    root.innerHTML = '<div class="archive-controls">' +
      '<div class="archive-search-row"><label><span class="visually-hidden">筛选档案</span><input type="search" value="' + escapeHtml(state.query) + '" placeholder="在标题、摘要与章节中筛选"></label>' +
      '<label><span class="visually-hidden">按年份筛选</span><select><option value="全部">全部年份</option>' +
      years.map(function (row) { return '<option value="' + escapeHtml(row.year) + '"' + (String(row.year) === state.year ? ' selected' : '') + '>' + escapeHtml(row.year) + ' 年</option>'; }).join('') +
      '</select></label></div>' +
      '<div class="archive-filter-row" role="group" aria-label="按主题筛选">' +
      categories.map(function (category) { return '<button type="button" data-category="' + escapeHtml(category) + '" aria-pressed="' + (category === state.category) + '">' + escapeHtml(category) + '</button>'; }).join('') +
      '<button type="button" data-favorites-only aria-pressed="' + state.favoritesOnly + '">我的收藏</button></div></div>' +
      '<div class="archive-summary"></div><div class="archive-list"></div>';

    var input = root.querySelector('input[type="search"]');
    var select = root.querySelector('select');
    var summary = root.querySelector('.archive-summary');
    var list = root.querySelector('.archive-list');

    function render() {
      var needle = state.query.trim().toLocaleLowerCase('zh-CN');
      var favorites = new Set(readFavorites().map(function (item) { return item.route; }));
      var rows = dataset.entries.filter(function (entry) {
        if (state.category !== '全部' && entry.category !== state.category) return false;
        if (state.year !== '全部' && String(entry.year) !== state.year) return false;
        if (state.favoritesOnly && !favorites.has(entry.route)) return false;
        if (!needle) return true;
        var haystack = [entry.title, entry.excerpt].concat((entry.sections || []).map(function (section) { return section.title; })).join(' ').toLocaleLowerCase('zh-CN');
        return haystack.indexOf(needle) >= 0;
      });
      summary.innerHTML = '<span>找到 ' + rows.length.toLocaleString('zh-CN') + ' 篇</span><span>' + (state.favoritesOnly ? '仅当前浏览器收藏' : '共 ' + dataset.summary.entries + ' 篇') + '</span>';
      list.innerHTML = rows.length ? rows.map(archiveItem).join('') : '<p class="archive-empty">这一组筛选还没有留下记录。</p>';
      updateArchiveUrl(state);
    }

    input.addEventListener('input', function () { state.query = input.value; render(); });
    select.addEventListener('change', function () { state.year = select.value; render(); });
    root.querySelectorAll('[data-category]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.category = button.dataset.category;
        root.querySelectorAll('[data-category]').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
        render();
      });
    });
    root.querySelector('[data-favorites-only]').addEventListener('click', function (event) {
      state.favoritesOnly = !state.favoritesOnly;
      event.currentTarget.setAttribute('aria-pressed', String(state.favoritesOnly));
      render();
    });
    list.addEventListener('click', function (event) {
      var button = event.target.closest('[data-favorite-route]');
      if (!button) return;
      var entry = dataset.entries.find(function (item) { return item.route === button.dataset.favoriteRoute; });
      if (entry) toggleFavorite(entry);
      render();
    });
    document.addEventListener('doc-ideas:favorites-changed', render, { once: true });
    render();
  }

  function mount(dataset) {
    mountArchiveYears(dataset);
    mountHomeStats(dataset);
    mountRecent(dataset);
    mountYearRiver(dataset);
    mountArchive(dataset);
    mountArticleTools(dataset);
  }

  function showDataError() {
    document.querySelectorAll('.data-loading').forEach(function (element) {
      element.textContent = '档案数据暂时没有加载成功，请稍后刷新。';
    });
  }

  document.addEventListener('click', function (event) {
    var randomButton = event.target.closest('[data-random-idea]');
    if (!randomButton) return;
    event.preventDefault();
    data().then(function (dataset) {
      var pool = dataset.entries.filter(function (entry) { return entry.route !== currentRoute(); });
      var entry = pool[Math.floor(Math.random() * pool.length)] || dataset.entries[0];
      if (entry) global.location.hash = entryHref(entry);
    }).catch(function () { showToast('暂时无法随机漫游', 'error'); });
  });

  favoriteButton.addEventListener('click', function () {
    if (favoriteButton.currentEntry) toggleFavorite(favoriteButton.currentEntry);
  });

  copyButton.addEventListener('click', function () {
    var value = global.location.href;
    var operation = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(value)
      : new Promise(function (resolve, reject) {
        var input = document.createElement('textarea');
        input.value = value;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); }
        catch (error) { reject(error); }
        input.remove();
      });
    operation.then(function () {
      copyButton.classList.add('is-success');
      showToast('链接已复制');
    }).catch(function () {
      copyButton.classList.add('is-error');
      showToast('复制失败，请从地址栏复制', 'error');
    }).finally(function () {
      global.setTimeout(function () { copyButton.classList.remove('is-success', 'is-error'); }, 1500);
    });
  });

  document.addEventListener('doc-ideas:rendered', function () {
    data().then(mount).catch(showDataError);
  });

  global.DocIdeas = {
    data: data,
    escapeHtml: escapeHtml,
    entryHref: entryHref,
    normalizeRoute: normalizeRoute
  };
}(window));
