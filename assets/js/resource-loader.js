(function (global) {
  'use strict';

  var jsonRequests = new Map();

  function asset(relative, retryNumber) {
    var url = new URL(relative, global.location.href.split('#')[0]);
    if (global.DOC_IDEAS_BUILD) url.searchParams.set('v', global.DOC_IDEAS_BUILD);
    if (retryNumber) url.searchParams.set('retry', String(retryNumber));
    return url.toString();
  }

  function pause(milliseconds) {
    return new Promise(function (resolve) { global.setTimeout(resolve, milliseconds); });
  }

  function retry(task, attempts) {
    var current = 0;
    function run() {
      return task(current).catch(function (error) {
        current += 1;
        if (current >= attempts) throw error;
        return pause(180 * current).then(run);
      });
    }
    return run();
  }

  function json(relative, options) {
    if (jsonRequests.has(relative)) return jsonRequests.get(relative);
    var attempts = Math.max(1, Number(options && options.attempts) || 3);
    var request = retry(function (retryNumber) {
      return global.fetch(asset(relative, retryNumber), { cache: retryNumber ? 'reload' : 'default' })
        .then(function (response) {
          if (!response.ok) throw new Error('资源加载失败：' + response.status);
          return response.json();
        });
    }, attempts).catch(function (error) {
      jsonRequests.delete(relative);
      throw error;
    });
    jsonRequests.set(relative, request);
    return request;
  }

  global.DocIdeasResources = { json: json };
}(window));
