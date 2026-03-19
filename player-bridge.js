(function() {
  // Reuse existing bridge if extension was reloaded
  var bridge = document.getElementById('ytm-ext-player-bridge');
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = 'ytm-ext-player-bridge';
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);
  }

  // Clear any existing interval from previous extension load
  if (bridge.dataset.intervalId) {
    clearInterval(parseInt(bridge.dataset.intervalId));
  }

  // Poll player state every 150ms and write to bridge element
  var intervalId = setInterval(function() {
    var player = document.querySelector('#movie_player');
    if (player && player.getCurrentTime) {
      bridge.dataset.time = player.getCurrentTime();
      bridge.dataset.duration = player.getDuration();
    }
  }, 150);
  bridge.dataset.intervalId = intervalId;

  // Listen for seek requests from content script
  document.addEventListener('ytm-ext-seek', function(e) {
    var player = document.querySelector('#movie_player');
    if (player && player.seekTo) {
      player.seekTo(e.detail.time, true);
    }
  });

  // Notify content script on URL changes (SPA navigation)
  if (!window.__ytmExtHistoryPatched) {
    window.__ytmExtHistoryPatched = true;
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function() {
      origPush.apply(this, arguments);
      document.dispatchEvent(new Event('ytm-ext-url-change'));
    };
    history.replaceState = function() {
      origReplace.apply(this, arguments);
      document.dispatchEvent(new Event('ytm-ext-url-change'));
    };
    window.addEventListener('popstate', function() {
      document.dispatchEvent(new Event('ytm-ext-url-change'));
    });
  }
})();
