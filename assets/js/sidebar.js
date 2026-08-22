(function () {
  'use strict';

  function directChild(element, tagName) {
    return Array.from(element.children).find(function (child) { return child.tagName === tagName; });
  }

  function groupTitle(item) {
    var label = item.querySelector(':scope > p > strong, :scope > strong, :scope > a');
    if (label) return label.textContent.trim();
    var text = Array.from(item.childNodes).filter(function (node) { return node.nodeType === Node.TEXT_NODE; })
      .map(function (node) { return node.textContent; }).join(' ').trim();
    return text || '目录分组';
  }

  function normalizedHash(value) {
    var hash = String(value || '').replace(/^.*#/, '#');
    try { return decodeURIComponent(hash).toLowerCase(); }
    catch (error) { return hash.toLowerCase(); }
  }

  function containsCurrentLink(list) {
    var current = normalizedHash(window.location.hash);
    return Array.from(list.querySelectorAll('a[href]')).some(function (link) {
      return normalizedHash(link.getAttribute('href')) === current;
    });
  }

  function storageKey(item, title, level) {
    var link = item.querySelector(':scope > a[href], :scope > p > a[href]');
    var identity = link ? link.getAttribute('href') : title;
    return 'doc-ideas:sidebar:' + level + ':' + identity;
  }

  function mountItem(item, list, level) {
    if (!list || item.querySelector(':scope > .sidebar-group-toggle')) return;
    var title = groupTitle(item);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-group-toggle';
    button.dataset.level = String(level);
    button.setAttribute('aria-label', '折叠“' + title + '”');
    button.title = '折叠或展开';
    item.classList.add('sidebar-tree-parent', 'sidebar-tree-level-' + level);
    list.classList.add('sidebar-collapsible');

    var saved = null;
    var key = storageKey(item, title, level);
    try { saved = sessionStorage.getItem(key); } catch (error) { /* Ignore storage errors. */ }
    var expanded = item.classList.contains('active') || list.querySelector('.active') || containsCurrentLink(list)
      ? true
      : saved !== '0';

    function update(next, persist) {
      expanded = next;
      list.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', (expanded ? '折叠' : '展开') + '“' + title + '”');
      if (persist) {
        try { sessionStorage.setItem(key, expanded ? '1' : '0'); } catch (error) { /* Ignore storage errors. */ }
      }
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      update(!expanded, true);
    });
    if (list.parentElement === item) item.insertBefore(button, list);
    else item.appendChild(button);
    update(expanded, false);
  }

  function mount() {
    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;

    /* Static sidebar groups and nested year groups. */
    Array.from(nav.querySelectorAll('li')).forEach(function (item) {
      var list = directChild(item, 'UL');
      if (list) mountItem(item, list, 1);
    });

    /* Current article title (level 1) owns Docsify's generated outline. */
    Array.from(nav.querySelectorAll('p')).forEach(function (item) {
      var list = directChild(item, 'UL');
      if (list && list.classList.contains('app-sub-sidebar')) mountItem(item, list, 1);
    });

    /* Docsify renders each H2 item beside its H3 list. Only H2 gets a toggle. */
    Array.from(nav.querySelectorAll('ul.app-sub-sidebar')).forEach(function (outline) {
      Array.from(outline.children).forEach(function (item) {
        var list = item.nextElementSibling;
        if (item.tagName === 'LI' && list && list.tagName === 'UL' && list.classList.contains('app-sub-sidebar')) {
          mountItem(item, list, 2);
        }
      });
    });
  }

  document.addEventListener('doc-ideas:rendered', mount);
  document.addEventListener('DOMContentLoaded', mount);
}());
