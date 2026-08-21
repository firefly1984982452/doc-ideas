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

  function storageKey(title) {
    return 'doc-ideas:sidebar:' + title;
  }

  function mountItem(item) {
    var list = directChild(item, 'UL');
    if (!list || item.querySelector(':scope > .sidebar-group-toggle')) return;
    var title = groupTitle(item);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-group-toggle';
    button.setAttribute('aria-label', '折叠“' + title + '”');
    button.title = '折叠或展开';

    var saved = null;
    try { saved = sessionStorage.getItem(storageKey(title)); } catch (error) { /* Ignore storage errors. */ }
    var expanded = list.querySelector('.active') ? true : saved !== '0';

    function update(next, persist) {
      expanded = next;
      list.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', (expanded ? '折叠' : '展开') + '“' + title + '”');
      if (persist) {
        try { sessionStorage.setItem(storageKey(title), expanded ? '1' : '0'); } catch (error) { /* Ignore storage errors. */ }
      }
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      update(!expanded, true);
    });
    item.insertBefore(button, list);
    update(expanded, false);
  }

  function mount() {
    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    Array.from(nav.querySelectorAll('li')).forEach(mountItem);
  }

  document.addEventListener('doc-ideas:rendered', mount);
  document.addEventListener('DOMContentLoaded', mount);
}());
