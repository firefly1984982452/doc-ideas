(function () {
  'use strict';

  var mounted = false;

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-CN');
  }

  function highlight(value, query) {
    var escaped = window.DocIdeas.escapeHtml(value);
    if (!query) return escaped;
    var expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    return escaped.replace(expression, function (match) { return '<mark>' + match + '</mark>'; });
  }

  function compact(value, limit) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
  }

  function matches(dataset, query) {
    var needle = normalize(query);
    if (!needle) return [];
    var results = [];

    dataset.entries.forEach(function (entry) {
      var title = normalize(entry.title);
      var excerpt = normalize(entry.excerpt);
      if (title.indexOf(needle) >= 0 || excerpt.indexOf(needle) >= 0) {
        results.push({ entry: entry, section: null, score: title.indexOf(needle) >= 0 ? 120 : 58, excerpt: entry.excerpt });
      }
      (entry.sections || []).forEach(function (section) {
        var sectionTitle = normalize(section.title);
        var sectionExcerpt = normalize(section.excerpt);
        if (sectionTitle.indexOf(needle) < 0 && sectionExcerpt.indexOf(needle) < 0) return;
        results.push({
          entry: entry,
          section: section,
          score: sectionTitle.indexOf(needle) >= 0 ? 95 : 46,
          excerpt: section.excerpt
        });
      });
    });

    return results.sort(function (left, right) {
      return right.score - left.score || Number(right.entry.year || 0) - Number(left.entry.year || 0);
    }).slice(0, 12);
  }

  function mount(dataset) {
    if (mounted || document.querySelector('.sidebar .search')) return;
    var sidebar = document.querySelector('.sidebar');
    var nav = sidebar && sidebar.querySelector('.sidebar-nav');
    if (!sidebar || !nav) return;
    mounted = true;

    var root = document.createElement('div');
    root.className = 'search';
    root.setAttribute('role', 'search');
    root.innerHTML = '<label><span class="visually-hidden">搜索全部档案</span><input type="search" autocomplete="off" placeholder="搜索念头、年份或关键词" aria-controls="idea-search-results"></label><div id="idea-search-results" class="search-results" aria-live="polite" hidden></div>';
    sidebar.insertBefore(root, nav);

    var input = root.querySelector('input');
    var panel = root.querySelector('.search-results');

    function render() {
      var query = input.value.trim();
      if (!query) {
        panel.hidden = true;
        panel.innerHTML = '';
        return;
      }
      var rows = matches(dataset, query);
      panel.hidden = false;
      panel.innerHTML = rows.length ? rows.map(function (result) {
        var label = result.section ? result.entry.title + ' · ' + result.section.title : result.entry.title;
        var href = window.DocIdeas.entryHref(result.entry, result.section && result.section.id);
        return '<a href="' + window.DocIdeas.escapeHtml(href) + '"><strong>' + highlight(label, query) + '</strong><small>' + highlight(compact(result.excerpt, 88), query) + '</small></a>';
      }).join('') : '<p class="search-empty">没有找到相关记录</p>';
    }

    input.addEventListener('input', render);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        input.value = '';
        render();
        input.blur();
      }
    });
    panel.addEventListener('click', function (event) {
      if (!event.target.closest('a')) return;
      input.value = '';
      render();
      document.body.classList.remove('close');
    });
    document.addEventListener('keydown', function (event) {
      var target = event.target;
      var isTyping = target && /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  function start() {
    if (!window.DocIdeas) return;
    window.DocIdeas.data().then(mount).catch(function () { /* Archive pages still work if search data fails. */ });
  }

  document.addEventListener('doc-ideas:rendered', start);
  document.addEventListener('DOMContentLoaded', start);
}());
