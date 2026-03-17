(function() {
  // Reuse existing bridge if extension was reloaded
  var bridge = document.getElementById('ytm-ext-player-bridge');
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = 'ytm-ext-player-bridge';
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);
  }

  // Poll player state every 150ms and write to bridge element
  setInterval(function() {
    var player = document.querySelector('#movie_player');
    if (player && player.getCurrentTime) {
      bridge.dataset.time = player.getCurrentTime();
      bridge.dataset.duration = player.getDuration();
    }
  }, 150);

  // Listen for seek requests from content script
  document.addEventListener('ytm-ext-seek', function(e) {
    var player = document.querySelector('#movie_player');
    if (player && player.seekTo) {
      player.seekTo(e.detail.time, true);
    }
  });
})();
