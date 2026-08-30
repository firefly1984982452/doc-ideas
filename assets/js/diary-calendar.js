(function (global) {
  'use strict';

  var activeCleanup = null;
  var routeTimer = null;
  var WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  function currentRoute() {
    var route = String(global.location.hash || '#/').split('?')[0].replace(/^#/, '');
    try { route = decodeURIComponent(route); } catch (error) { /* Keep the encoded route. */ }
    if (!route || route === '/') return '/';
    if (route.charAt(0) !== '/') route = '/' + route;
    return route.replace(/\.md$/, '');
  }

  function diaryYearFromRoute(route) {
    var match = String(route || '').match(/^\/docs\/idea\/(\d{4})年的只言片语$/);
    if (!match) return null;
    var year = Number(match[1]);
    return year >= 2016 ? year : null;
  }

  function headingText(heading) {
    var clone = heading.cloneNode(true);
    clone.querySelectorAll('button').forEach(function (button) { button.remove(); });
    return String(clone.textContent || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function validMonth(value) {
    return Number.isInteger(value) && value >= 1 && value <= 12;
  }

  function validDay(year, month, day) {
    return validMonth(month) && Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
  }

  function monthInText(text) {
    var match = text.match(/(?:^|[^\d])(\d{1,2})\s*月/);
    var month = match ? Number(match[1]) : null;
    return validMonth(month) ? month : null;
  }

  function isWeekSummary(text) {
    return /第[^（）()]{0,12}周|春节周|剩下周|周总结|(?:前|后|上|下)半月/.test(text);
  }

  function rangeStartMonth(text, fallback) {
    var range = text.match(/(\d{1,2})\s*月\s*\d{1,2}\s*(?:日|号)?\s*[-—–~～至]\s*(?:(\d{1,2})\s*月)?\s*\d{1,2}/);
    var month = range ? Number(range[1]) : fallback;
    return validMonth(month) ? month : fallback;
  }

  function numericDate(text, fixedYear) {
    var match = text.match(/(?:^|[^\d])((?:19|20)\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:[^\d]|$)/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (year !== fixedYear || !validDay(year, month, day)) return null;
    return { month: month, days: [day], score: 4 };
  }

  function dayValues(text) {
    var value = text.replace(/(?:日|号)\s*[、,，/]\s*(?=\d)/g, '、');
    var list = value.match(/(?:^|[^\d])(\d{1,2}(?:\s*[、,，/]\s*\d{1,2})*)\s*(?:日|号)/);
    if (list) {
      return list[1].split(/\s*[、,，/]\s*/).map(Number).filter(Number.isInteger);
    }

    var range = value.match(/(?:^|[^\d])(\d{1,2})\s*[-—–~～至]\s*(\d{1,2})(?:\s*(?:日|号))?(?:[^\d]|$)/);
    if (range) {
      var start = Number(range[1]);
      var end = Number(range[2]);
      if (start >= 1 && start <= 31 && end >= 1 && end <= 31) {
        if (start <= end && end - start <= 14) {
          return Array.from({ length: end - start + 1 }, function (_, index) { return start + index; });
        }
        if (start > end && (31 - start + 1) + end <= 14) {
          return Array.from({ length: 31 - start + end + 1 }, function (_, index) {
            return index <= 31 - start ? start + index : index - (31 - start);
          });
        }
      }
    }

    var bare = value.match(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]+[、,.]?\s*)?(\d{1,2})\s*$/);
    return bare ? [Number(bare[1])] : [];
  }

  function inferredDates(days, explicitMonth, state, year) {
    var dates = [];
    var month = explicitMonth || state.sequenceMonth || state.contextMonth;
    if (!validMonth(month)) return dates;

    days.forEach(function (day) {
      var candidate = month;
      if (!explicitMonth) {
        if (state.previousDay >= 25 && day <= 7 && candidate < 12) candidate += 1;
        else if (!validDay(year, candidate, day) && candidate > 1 && validDay(year, candidate - 1, day)) candidate -= 1;
      }
      if (!validDay(year, candidate, day)) return;
      dates.push({ month: candidate, day: day });
      month = candidate;
      state.sequenceMonth = candidate;
      state.previousDay = day;
    });
    return dates;
  }

  function dateParts(text, state, year) {
    var numeric = numericDate(text, year);
    if (numeric) {
      state.sequenceMonth = numeric.month;
      state.previousDay = numeric.days[0];
      return { dates: [{ month: numeric.month, day: numeric.days[0] }], score: numeric.score };
    }

    var explicitYear = text.match(/((?:19|20)\d{2})\s*年/);
    if (explicitYear && Number(explicitYear[1]) !== year) return { dates: [], score: 0 };
    var explicitMonth = monthInText(text);
    var source = text;
    if (explicitMonth) {
      var monthPattern = new RegExp('(?:^|[^\\d])' + explicitMonth + '\\s*月');
      var monthMatch = monthPattern.exec(text);
      if (monthMatch) source = text.slice(monthMatch.index + monthMatch[0].length);
    }
    var days = dayValues(source);
    if (!days.length) return { dates: [], score: 0 };

    var dates = inferredDates(days, explicitMonth, state, year);
    var score = explicitYear && explicitMonth ? 4 : explicitMonth ? 3 : 2;
    if (/所做事项/.test(text)) score -= 1;
    if (dates.length > 1) score -= 1;
    return { dates: dates, score: score };
  }

  function collectDiaryDates(article, year) {
    var records = new Map();
    var state = { contextMonth: null, sequenceMonth: null, previousDay: null };

    Array.from(article.querySelectorAll('h2[id], h3[id]')).forEach(function (heading) {
      var text = headingText(heading);
      var month = monthInText(text);
      if (heading.tagName === 'H2' && month) {
        state.contextMonth = month;
        state.sequenceMonth = isWeekSummary(text) ? rangeStartMonth(text, month) : month;
        state.previousDay = null;
      }
      if (isWeekSummary(text)) return;

      var result = dateParts(text, state, year);
      result.dates.forEach(function (date) {
        var key = date.month + '-' + date.day;
        var existing = records.get(key);
        var next = {
          year: year,
          month: date.month,
          day: date.day,
          id: heading.id,
          title: text,
          score: result.score,
          count: existing ? existing.count + 1 : 1
        };
        if (!existing || next.score > existing.score) records.set(key, next);
        else existing.count += 1;
      });
    });

    return Array.from(records.values()).sort(function (left, right) {
      return left.month - right.month || left.day - right.day;
    });
  }

  function currentAnchor() {
    var query = String(global.location.hash || '').split('?')[1] || '';
    var value = new URLSearchParams(query).get('id') || '';
    try { return decodeURIComponent(value); } catch (error) { return value; }
  }

  function refreshToolbar(toolbar) {
    if (global.DocIdeas && typeof global.DocIdeas.refreshArticleTools === 'function') {
      global.DocIdeas.refreshArticleTools();
    } else {
      toolbar.hidden = !toolbar.querySelector('.diary-calendar-control');
    }
  }

  function calendarIcon() {
    return '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>';
  }

  function makeControl(article, route, year, records) {
    var toolbar = document.getElementById('idea-tools');
    if (!toolbar) return null;
    var obsoleteRow = article.querySelector(':scope > .article-meta-row');
    if (obsoleteRow) obsoleteRow.remove();
    article.classList.add('has-diary-calendar');

    var control = document.createElement('div');
    var toggle = document.createElement('button');
    var popover = document.createElement('section');
    var popoverId = 'diary-calendar-' + year;
    control.className = 'diary-calendar-control';
    control.dataset.diaryYear = String(year);
    control.dataset.diaryRoute = route;
    toggle.type = 'button';
    toggle.className = 'article-tool diary-calendar-toggle';
    toggle.dataset.tooltip = '日历';
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', popoverId);
    toggle.setAttribute('aria-label', '打开 ' + year + ' 年日记日历');
    toggle.innerHTML = calendarIcon() + '<span class="visually-hidden">日历</span>';

    popover.id = popoverId;
    popover.className = 'diary-calendar-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-labelledby', popoverId + '-title');
    popover.hidden = true;
    popover.innerHTML = '<header class="diary-calendar-head">' +
      '<div><small>日记年份</small><strong id="' + popoverId + '-title">' + year + ' 年</strong></div>' +
      '<label><span class="visually-hidden">选择月份</span><select aria-label="选择 ' + year + ' 年的月份"></select></label>' +
      '<button class="diary-calendar-close" type="button" aria-label="关闭日历">×</button>' +
      '</header>' +
      '<table class="diary-calendar-table"><thead><tr>' + WEEK_LABELS.map(function (label) { return '<th scope="col">' + label + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table>' +
      '<p class="diary-calendar-note" aria-live="polite"></p>';
    control.appendChild(toggle);
    toolbar.insertBefore(control, toolbar.firstChild);
    document.body.appendChild(popover);
    refreshToolbar(toolbar);

    var select = popover.querySelector('select');
    var tbody = popover.querySelector('tbody');
    var note = popover.querySelector('.diary-calendar-note');
    var closeButton = popover.querySelector('.diary-calendar-close');
    var counts = new Map();
    records.forEach(function (record) { counts.set(record.month, (counts.get(record.month) || 0) + 1); });
    for (var month = 1; month <= 12; month += 1) {
      var option = document.createElement('option');
      option.value = String(month);
      option.textContent = month + '月' + (counts.get(month) ? ' · ' + counts.get(month) + '天' : '');
      select.appendChild(option);
    }

    var anchor = currentAnchor();
    var currentRecord = records.find(function (record) { return record.id === anchor; });
    var newest = records[records.length - 1];
    var today = new Date();
    var selectedMonth = currentRecord ? currentRecord.month
      : newest ? newest.month
        : today.getFullYear() === year ? today.getMonth() + 1 : 1;
    select.value = String(selectedMonth);

    function recordsFor(monthValue, day) {
      return records.find(function (record) { return record.month === monthValue && record.day === day; });
    }

    function renderMonth(monthValue) {
      selectedMonth = Number(monthValue);
      tbody.innerHTML = '';
      var offset = (new Date(year, selectedMonth - 1, 1).getDay() + 6) % 7;
      var total = daysInMonth(year, selectedMonth);
      var cells = offset + total;
      var rows = Math.ceil(cells / 7);
      var day = 1;

      for (var rowIndex = 0; rowIndex < rows; rowIndex += 1) {
        var tableRow = document.createElement('tr');
        for (var column = 0; column < 7; column += 1) {
          var cellIndex = rowIndex * 7 + column;
          var cell = document.createElement('td');
          if (cellIndex < offset || day > total) {
            cell.className = 'is-empty';
            cell.setAttribute('aria-hidden', 'true');
          } else {
            var record = recordsFor(selectedMonth, day);
            var dayButton = document.createElement('button');
            var isToday = today.getFullYear() === year && today.getMonth() + 1 === selectedMonth && today.getDate() === day;
            dayButton.type = 'button';
            dayButton.textContent = String(day);
            dayButton.className = 'diary-calendar-day';
            dayButton.disabled = !record;
            dayButton.setAttribute('aria-label', year + '年' + selectedMonth + '月' + day + '日' +
              (record ? '，' + record.count + '条日记' : '，无日记'));
            if (record) {
              dayButton.dataset.targetId = record.id;
              dayButton.title = record.title + (record.count > 1 ? ' · ' + record.count + ' 条记录' : '');
              if (record.id === currentAnchor()) dayButton.setAttribute('aria-current', 'date');
              if (record.count > 1) dayButton.dataset.count = String(record.count);
            }
            if (isToday) dayButton.classList.add('is-today');
            cell.appendChild(dayButton);
            day += 1;
          }
          tableRow.appendChild(cell);
        }
        tbody.appendChild(tableRow);
      }

      var count = counts.get(selectedMonth) || 0;
      note.textContent = count
        ? selectedMonth + ' 月有 ' + count + ' 个可定位日期 · 年份固定为 ' + year
        : selectedMonth + ' 月暂无可定位的日记 · 年份固定为 ' + year;
    }

    function close(restoreFocus) {
      popover.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }

    function open() {
      popover.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      global.requestAnimationFrame(function () { select.focus({ preventScroll: true }); });
    }

    function revealExistingTarget(id) {
      var target = document.getElementById(id);
      if (!target) return;
      var current = target;
      while (current && current !== article) {
        if (current.tagName === 'H2') {
          var fold = current.querySelector('.section-fold-toggle[aria-expanded="false"]');
          if (fold) fold.click();
          break;
        }
        current = current.previousElementSibling || current.parentElement;
      }
      global.setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 180);
    }

    toggle.addEventListener('click', function () {
      if (popover.hidden) open();
      else close(true);
    });
    closeButton.addEventListener('click', function () { close(true); });
    select.addEventListener('change', function () { renderMonth(select.value); });
    tbody.addEventListener('click', function (event) {
      var button = event.target.closest('[data-target-id]');
      if (!button) return;
      var id = button.dataset.targetId;
      var nextHash = '#' + route + '?id=' + encodeURIComponent(id);
      close(false);
      if (global.location.hash === nextHash) revealExistingTarget(id);
      else global.location.hash = nextHash;
    });

    function outsideClick(event) {
      if (!popover.hidden && !control.contains(event.target) && !popover.contains(event.target)) close(false);
    }
    function escapeKey(event) {
      if (event.key === 'Escape' && !popover.hidden) {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener('click', outsideClick);
    document.addEventListener('keydown', escapeKey);
    renderMonth(selectedMonth);

    return function () {
      document.removeEventListener('click', outsideClick);
      document.removeEventListener('keydown', escapeKey);
      control.remove();
      popover.remove();
      article.classList.remove('has-diary-calendar');
      refreshToolbar(toolbar);
    };
  }

  function mount() {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    var route = currentRoute();
    var year = diaryYearFromRoute(route);
    if (!year) return;
    var article = document.querySelector('.markdown-section');
    var title = article && article.querySelector('h1');
    if (!title || headingText(title).replace(/\s+/g, '').indexOf(year + '年的只言片语') < 0) return;
    activeCleanup = makeControl(article, route, year, collectDiaryDates(article, year));
  }

  document.addEventListener('doc-ideas:rendered', mount);
  document.addEventListener('DOMContentLoaded', mount);
  global.addEventListener('hashchange', function () {
    global.clearTimeout(routeTimer);
    routeTimer = global.setTimeout(mount, 80);
  });

  global.DocIdeasDiaryCalendar = {
    collectDiaryDates: collectDiaryDates,
    diaryYearFromRoute: diaryYearFromRoute
  };
}(window));
