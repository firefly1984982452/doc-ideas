(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var progress = document.getElementById('reading-progress');
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function closeCoverAndShowRoute(route) {
    var cover = document.querySelector('.cover');
    if (cover) {
      cover.classList.remove('show');
      cover.setAttribute('aria-hidden', 'true');
    }
    if (window.location.hash !== route) {
      window.location.hash = route;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', function (event) {
    var action = event.target.closest('[data-cover-action]');
    if (!action) return;
    event.preventDefault();
    closeCoverAndShowRoute(action.dataset.coverAction === 'archive' ? '#/docs/archive.md' : '#/');
  });

  function updateThemeLabel() {
    var isDark = root.dataset.theme === 'dark';
    var label = isDark ? '切换到浅色主题' : '切换到深色主题';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    toggle.classList.toggle('is-dark', isDark);
    if (themeMeta) themeMeta.content = isDark ? '#171318' : '#713d78';
  }

  toggle.addEventListener('click', function () {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('doc-ideas-theme', next); }
    catch (error) { /* Theme switching still works without storage. */ }
    updateThemeLabel();
  });

  function updateProgress() {
    var article = document.querySelector('.markdown-section');
    if (!article) return;
    var rect = article.getBoundingClientRect();
    var readable = Math.max(article.scrollHeight - window.innerHeight, 1);
    var read = Math.min(Math.max(-rect.top, 0), readable);
    progress.style.transform = 'scaleX(' + (read / readable) + ')';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  window.addEventListener('hashchange', function () {
    progress.style.transform = 'scaleX(0)';
    window.requestAnimationFrame(updateProgress);
  });
  document.addEventListener('doc-ideas:rendered', updateProgress);

  updateThemeLabel();
}());
