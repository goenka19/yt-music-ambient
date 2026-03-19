(function() {
  'use strict';

  let ambientContainer = null;
  let currentArtUrl = null;
  let observer = null;
  let mainUpdateInterval = null;
  let miniPlayerAutoCloseInterval = null;
  let settings = {
    ambientEnabled: true,
    animatedEnabled: false,
    shiftUpEnabled: false,
    reducedSizeEnabled: false
  };

  const ALBUM_ART_SELECTORS = [
    'ytmusic-player-bar .image',
    'ytmusic-player-bar img.image',
    '.ytmusic-player-bar .thumbnail img',
    'img.ytmusic-player-bar',
    '.content-info-wrapper img',
    'ytmusic-player .image',
    '#song-image img',
    '.thumbnail-image-wrapper img'
  ];

  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get(['ambientEnabled', 'animatedEnabled', 'shiftUpEnabled', 'reducedSizeEnabled'], (data) => {
      settings.ambientEnabled = data.ambientEnabled !== false; // default true
      settings.animatedEnabled = data.animatedEnabled === true; // default false
      settings.shiftUpEnabled = data.shiftUpEnabled === true; // default false
      settings.reducedSizeEnabled = data.reducedSizeEnabled === true; // default false
      applySettings();
    });
  }

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.ambientEnabled !== undefined) {
        settings.ambientEnabled = changes.ambientEnabled.newValue;
      }
      if (changes.animatedEnabled !== undefined) {
        settings.animatedEnabled = changes.animatedEnabled.newValue;
      }
      if (changes.shiftUpEnabled !== undefined) {
        settings.shiftUpEnabled = changes.shiftUpEnabled.newValue;
      }
      if (changes.reducedSizeEnabled !== undefined) {
        settings.reducedSizeEnabled = changes.reducedSizeEnabled.newValue;
      }
      applySettings();
    }
  });

  // Apply settings to DOM
  function applySettings() {
    updatePageState();
    if (ambientContainer) {
      ambientContainer.classList.toggle('animated', settings.animatedEnabled);
    }
    document.body.classList.toggle('layout-shift-up', settings.shiftUpEnabled);
    document.body.classList.toggle('layout-reduced-size', settings.reducedSizeEnabled);
  }

  // Check if on now-playing page
  function isNowPlayingPage() {
    return window.location.pathname.includes('/watch');
  }

  // Update page state based on URL and settings
  function updatePageState() {
    const shouldShowAmbient = settings.ambientEnabled && isNowPlayingPage();
    document.body.classList.toggle('ambient-active', shouldShowAmbient);
    document.body.classList.toggle('ytm-ext-active', shouldShowAmbient);

    if (ambientContainer) {
      ambientContainer.style.display = shouldShowAmbient ? 'block' : 'none';
    }
  }

  function getAlbumArtUrl() {
    for (const selector of ALBUM_ART_SELECTORS) {
      const img = document.querySelector(selector);
      if (img && img.src) {
        let url = img.src;
        url = url.replace(/=w\d+-h\d+/, '=w1200-h1200');
        url = url.replace(/=s\d+/, '=s1200');
        return url;
      }
    }
    return null;
  }

  function createAmbientBackground() {
    if (ambientContainer) return;

    ambientContainer = document.createElement('div');
    ambientContainer.id = 'yt-music-ambient-bg';
    ambientContainer.className = 'ambient-container';

    // Create 3 layers for animation
    for (let i = 1; i <= 3; i++) {
      const layer = document.createElement('div');
      layer.className = `ambient-layer layer-${i}`;
      ambientContainer.appendChild(layer);
    }

    document.body.prepend(ambientContainer);
    applySettings();
  }

  function updateBackground(artUrl) {
    if (!artUrl || artUrl === currentArtUrl) return;

    currentArtUrl = artUrl;
    createAmbientBackground();

    const img = new Image();
    img.onload = function() {
      if (ambientContainer) {
        const layers = ambientContainer.querySelectorAll('.ambient-layer');
        layers.forEach(layer => {
          layer.style.backgroundImage = `url('${artUrl}')`;
        });
      }
    };
    img.src = artUrl;
  }

  function checkAndUpdate() {
    updatePageState();
    const artUrl = getAlbumArtUrl();
    if (artUrl) {
      updateBackground(artUrl);
    }
  }

  function initObserver() {
    if (observer) return;

    observer = new MutationObserver(function(mutations) {
      clearTimeout(window.ambientUpdateTimeout);
      window.ambientUpdateTimeout = setTimeout(function() {
        checkAndUpdate();
        addYouTubeLink();
        addMiniPlayerButton();
        updateUnifiedAlbumArt();
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  // Slide-in animation for non-/watch → /watch navigation
  function applySlideInAnimation() {
    const elements = [
      document.getElementById('ytm-ext-unified-art'),
      document.getElementById('ytm-ext-sidebar-toggle'),
      document.querySelector('#av-id'),
      ambientContainer
    ];
    elements.forEach(el => {
      if (el) {
        el.classList.add('slide-in');
        el.addEventListener('animationend', () => {
          el.classList.remove('slide-in');
        }, { once: true });
      }
    });
  }

  // Listen for URL changes (YouTube Music is SPA)
  let urlObserver = null;
  function initUrlObserver() {
    if (urlObserver) return;
    let lastUrl = location.href;

    function onUrlChange() {
      if (location.href !== lastUrl) {
        const wasWatch = wasOnWatchPage;
        lastUrl = location.href;
        wasOnWatchPage = isNowPlayingPage();
        updatePageState();
        checkAndUpdate();
        // Recreate elements if missing after navigation
        if (isNowPlayingPage()) {
          createUnifiedAlbumArt();
          createSidebarToggle();
          updateUnifiedAlbumArt();
          // Slide-in only when entering /watch from non-/watch
          if (!wasWatch) {
            requestAnimationFrame(() => applySlideInAnimation());
          }
        }
      }
    }

    // Listen for history API changes from player-bridge.js (page context)
    document.addEventListener('ytm-ext-url-change', onUrlChange);

    // Keep MutationObserver as fallback
    urlObserver = new MutationObserver(onUrlChange);
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  function addYouTubeLink() {
    if (document.getElementById('yt-music-open-yt')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (!videoId) return;

    const rightControls = document.querySelector('ytmusic-player-bar .right-controls-buttons');
    if (!rightControls) return;

    const btn = document.createElement('a');
    btn.id = 'yt-music-open-yt';
    btn.href = `https://www.youtube.com/watch?v=${videoId}`;
    btn.target = '_blank';
    btn.title = 'Open in YouTube (see comments)';
    btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;transition:background 0.2s;';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onmouseout = () => btn.style.background = 'transparent';

    // Insert AFTER volume slider (so button is to the RIGHT of volume)
    const volumeSlider = rightControls.querySelector('#volume-slider');
    if (volumeSlider) {
      const volumeContainer = volumeSlider.closest('.volume-slider, [class*="volume"]') || volumeSlider.parentElement;
      if (volumeContainer && volumeContainer.nextSibling) {
        rightControls.insertBefore(btn, volumeContainer.nextSibling);
      } else {
        rightControls.appendChild(btn);
      }
    } else {
      rightControls.appendChild(btn);
    }
  }

  // ============================================
  // MINI PLAYER (Document Picture-in-Picture)
  // ============================================

  let pipWindow = null;
  let pipSyncInterval = null;
  let miniPlayerArmed = false;

  function updateArmButtonState() {
    const btn = document.getElementById('ytm-ext-pip-btn');
    if (btn) {
      btn.style.background = miniPlayerArmed ? 'rgba(255,255,255,0.2)' : 'transparent';
      btn.title = miniPlayerArmed ? 'Mini Player Armed (click to disarm)' : 'Arm Mini Player';
    }
  }

  function armMiniPlayer() {
    // Check for stale reference
    if (pipWindow && pipWindow.closed) {
      pipWindow = null;
    }

    if (pipWindow) {
      // PiP is open, close it and disarm
      closePipWindow();
      miniPlayerArmed = false;
    } else {
      // Toggle armed state
      miniPlayerArmed = !miniPlayerArmed;
      // Pre-cache album art for faster PiP opening
      if (miniPlayerArmed) {
        const artUrl = getAlbumArtUrl();
        if (artUrl) {
          const img = new Image();
          img.src = artUrl;
        }
      }
    }
    updateArmButtonState();
  }

  function addMiniPlayerButton() {
    if (!('documentPictureInPicture' in window)) return;
    if (document.getElementById('ytm-ext-pip-btn')) return;

    const rightControls = document.querySelector('ytmusic-player-bar .right-controls-buttons');
    if (!rightControls) return;

    const btn = document.createElement('button');
    btn.id = 'ytm-ext-pip-btn';
    btn.title = 'Arm Mini Player';
    btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;border:none;background:transparent;cursor:pointer;transition:background 0.2s;';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>';
    btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onmouseout = () => btn.style.background = miniPlayerArmed ? 'rgba(255,255,255,0.2)' : 'transparent';
    btn.onclick = armMiniPlayer;

    const ytBtn = document.getElementById('yt-music-open-yt');
    if (ytBtn && ytBtn.nextSibling) {
      rightControls.insertBefore(btn, ytBtn.nextSibling);
    } else {
      rightControls.appendChild(btn);
    }
  }

  async function openMiniPlayer() {
    if (pipWindow) {
      pipWindow.focus();
      return;
    }

    try {
      pipWindow = await documentPictureInPicture.requestWindow({
        width: 200,
        height: 200
      });

      const artUrl = getAlbumArtUrl() || '';
      const title = getSongTitle() || 'No song playing';
      const artist = getArtistName() || '';
      const video = document.querySelector('video');
      const isPlaying = video && !video.paused;

      pipWindow.document.body.innerHTML = `
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 200px;
            height: 200px;
            background-size: cover;
            background-position: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
          }
          .ytm-ext-pip-overlay,
          .ytm-ext-pip-close {
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          body:hover .ytm-ext-pip-overlay,
          body:hover .ytm-ext-pip-close {
            opacity: 1;
          }
          .ytm-ext-pip-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 12px;
            background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.8) 100%);
          }
          .ytm-ext-pip-title {
            color: white;
            font-size: 13px;
            font-weight: 600;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 0 1px 4px rgba(0,0,0,0.8);
          }
          .ytm-ext-pip-artist {
            color: rgba(255,255,255,0.8);
            font-size: 11px;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 0 1px 4px rgba(0,0,0,0.8);
            margin-bottom: 8px;
          }
          .ytm-ext-pip-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
          }
          .ytm-ext-pip-controls button {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
          }
          .ytm-ext-pip-controls button:hover {
            background: rgba(255,255,255,0.2);
          }
          .ytm-ext-pip-controls svg {
            fill: white;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
          }
          .ytm-ext-pip-close {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            border: none;
            cursor: pointer;
            padding: 4px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .ytm-ext-pip-close:hover {
            background: rgba(0,0,0,0.8);
          }
          .ytm-ext-pip-close svg {
            fill: white;
            width: 14px;
            height: 14px;
          }
        </style>
        <button class="ytm-ext-pip-close" id="ytm-ext-pip-close-btn">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
        <div class="ytm-ext-pip-overlay">
          <div class="ytm-ext-pip-title" id="ytm-ext-pip-title">${title}</div>
          <div class="ytm-ext-pip-artist" id="ytm-ext-pip-artist">${artist}</div>
          <div class="ytm-ext-pip-controls">
            <button id="ytm-ext-pip-prev">
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button id="ytm-ext-pip-play">
              ${isPlaying
                ? '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
                : '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
              }
            </button>
            <button id="ytm-ext-pip-next">
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      `;

      // Set background image via DOM API to avoid XSS from URL interpolation
      if (artUrl) {
        pipWindow.document.body.style.backgroundImage = `url("${artUrl}")`;
      }

      pipWindow.document.getElementById('ytm-ext-pip-close-btn').onclick = () => pipWindow.close();
      pipWindow.document.getElementById('ytm-ext-pip-prev').onclick = () => {
        const prevBtn = document.querySelector('ytmusic-player-bar .previous-button button');
        if (prevBtn) prevBtn.click();
      };
      pipWindow.document.getElementById('ytm-ext-pip-next').onclick = () => {
        const nextBtn = document.querySelector('ytmusic-player-bar .next-button button');
        if (nextBtn) nextBtn.click();
      };
      pipWindow.document.getElementById('ytm-ext-pip-play').onclick = () => {
        const playBtn = document.querySelector('ytmusic-player-bar #play-pause-button button');
        if (playBtn) playBtn.click();
      };

      pipSyncInterval = setInterval(syncMiniPlayerState, 500);

      pipWindow.addEventListener('pagehide', () => {
        clearInterval(pipSyncInterval);
        pipSyncInterval = null;
        pipWindow = null;
        miniPlayerArmed = false;
        updateArmButtonState();
      });

    } catch (error) {
      console.error('[YTM-Ext] Failed to open mini player:', error);
      pipWindow = null;
    }
  }

  function syncMiniPlayerState() {
    if (!pipWindow || pipWindow.closed) {
      pipWindow = null;
      return;
    }

    const video = document.querySelector('video');
    const isPlaying = video && !video.paused;
    const title = getSongTitle() || 'No song playing';
    const artist = getArtistName() || '';
    const artUrl = getAlbumArtUrl() || '';

    const titleEl = pipWindow.document.getElementById('ytm-ext-pip-title');
    const artistEl = pipWindow.document.getElementById('ytm-ext-pip-artist');
    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;

    pipWindow.document.body.style.backgroundImage = `url('${artUrl}')`;

    const playBtn = pipWindow.document.getElementById('ytm-ext-pip-play');
    if (playBtn) {
      playBtn.innerHTML = isPlaying
        ? '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
        : '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  }

  function closePipWindow() {
    const apiPip = window.documentPictureInPicture?.window;
    if (apiPip) {
      try { apiPip.close(); } catch (e) {}
    }
    if (pipWindow && pipWindow !== apiPip) {
      try { pipWindow.close(); } catch (e) {}
    }
    pipWindow = null;
  }

  function initMiniPlayerAutoClose() {
    let wasHidden = document.hidden;

    // Clear any existing interval first
    if (miniPlayerAutoCloseInterval) clearInterval(miniPlayerAutoCloseInterval);
    miniPlayerAutoCloseInterval = setInterval(() => {
      // Check for stale reference
      if (pipWindow && pipWindow.closed) {
        pipWindow = null;
        miniPlayerArmed = false;
        updateArmButtonState();
      }

      const isHidden = document.hidden;

      // AUTO-CLOSE: Tab became visible and PiP is open
      if (wasHidden && !isHidden && pipWindow) {
        closePipWindow();
        miniPlayerArmed = false;
        updateArmButtonState();
      }

      // AUTO-OPEN: Tab became hidden and armed
      if (!wasHidden && isHidden && miniPlayerArmed && !pipWindow) {
        openMiniPlayer();
      }

      wasHidden = isHidden;
    }, 100);
  }

  let keyboardShortcutsInitialized = false;
  function initKeyboardShortcuts() {
    if (keyboardShortcutsInitialized) return;
    keyboardShortcutsInitialized = true;
    document.addEventListener('keydown', (e) => {
      // Don't trigger when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Only trigger on plain 'p' without modifier keys
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        armMiniPlayer();
      }

      // 'Shift+S' for sidebar toggle (prevents conflict with YouTube's 'S')
      if (e.key.toLowerCase() === 's' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      }

      // ']' key for sidebar toggle in fullscreen
      if (e.key === ']' && document.body.classList.contains('fullscreen-active')) {
        e.preventDefault();
        toggleSidebar();
      }
    });
  }

  // ============================================
  // SYNCED LYRICS
  // ============================================

  let lyricsObserver = null;
  let currentSyncHandler = null;
  let currentSongTitle = null;
  let isFullscreen = false;
  let fullscreenContainer = null;
  let originalLyricsParent = null;
  let lyricsScrollPosition = 0;
  let lyricsCurrentIndex = -1;
  let isTransitioningFullscreen = false;
  let isVideoReady = true;
  let syncSessionId = 0;

  // ============================================
  // UNIFIED ALBUM ART & SIDEBAR - Variables
  // ============================================
  let currentSongHasLyrics = false;
  let lyricsState = 'none'; // 'synced', 'plain', 'none'
  let lyricsClickHandler = null;
  let isCrossfading = false;
  let wasOnWatchPage = false;
  let visibilityScrollInterval = null;

  // ============================================
  // LOGGING & DEBUG INFRASTRUCTURE
  // ============================================

  function safeCall(fn, name) {
    return function(...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        console.error(`[YTM-Ext:Error] ${name} failed:`, error);
        console.error('[YTM-Ext:Error] Stack:', error.stack);
        return null;
      }
    };
  }

  function preFlightCheck() {
    console.group('[YTM-Ext:PreFlight] Running pre-flight checks...');
    let allPassed = true;

    const url = getAlbumArtUrl();
    if (url) {
      console.log('✅ getAlbumArtUrl() returns URL');
      if (url.includes('w1200') || url.includes('s1200')) {
        console.log('✅ URL is high-resolution (1200px)');
      } else {
        console.warn('⚠️ URL might be low-resolution:', url);
      }
    } else {
      console.log('⚠️ getAlbumArtUrl() returned null (no song playing?)');
    }

    const testDiv = document.createElement('div');
    testDiv.id = 'ytm-ext-test';
    document.body.appendChild(testDiv);
    const found = document.getElementById('ytm-ext-test');
    if (found) {
      console.log('✅ Can create and append elements to body');
      found.remove();
    } else {
      console.error('❌ CRITICAL: Cannot append elements to body!');
      allPassed = false;
    }

    document.body.classList.add('ytm-ext-test-class');
    if (document.body.classList.contains('ytm-ext-test-class')) {
      console.log('✅ CSS class manipulation works');
      document.body.classList.remove('ytm-ext-test-class');
    } else {
      console.error('❌ CRITICAL: CSS class manipulation failed!');
      allPassed = false;
    }

    try {
      localStorage.setItem('ytm-ext-test', 'test');
      const value = localStorage.getItem('ytm-ext-test');
      if (value === 'test') {
        console.log('✅ localStorage works');
        localStorage.removeItem('ytm-ext-test');
      } else {
        console.error('❌ localStorage read/write mismatch');
        allPassed = false;
      }
    } catch (e) {
      console.error('❌ localStorage error:', e);
      allPassed = false;
    }

    console.log('---');
    if (allPassed) {
      console.log('✅ All pre-flight checks passed!');
    } else {
      console.error('❌ Some pre-flight checks FAILED - features may not work!');
    }
    console.groupEnd();
    return allPassed;
  }

  function verifyUnifiedArtState() {
    console.group('[YTM-Ext:Verify] System State Check');

    const container = document.getElementById('ytm-ext-unified-art');
    console.log('Container exists:', !!container);

    const img = document.getElementById('ytm-ext-unified-art-img');
    console.log('Image exists:', !!img);
    console.log('Image has src:', img?.src ? 'yes' : 'no');
    console.log('Container hidden class:', container?.classList.contains('hidden'));

    console.log('Body classes:', {
      'ytm-ext-active': document.body.classList.contains('ytm-ext-active'),
      'sidebar-collapsed': document.body.classList.contains('sidebar-collapsed'),
      'fullscreen-active': document.body.classList.contains('fullscreen-active'),
      'video-mode': document.body.classList.contains('video-mode')
    });

    const sidebarBtn = document.getElementById('ytm-ext-sidebar-toggle');
    console.log('Sidebar toggle exists:', !!sidebarBtn);

    const songImage = document.querySelector('#song-image');
    if (songImage) {
      const computed = window.getComputedStyle(songImage);
      console.log('Native #song-image opacity:', computed.opacity);
    }

    if (img) {
      const rect = img.getBoundingClientRect();
      console.log('Unified art dimensions:', rect.width + 'x' + rect.height);
      console.log('Unified art position:', 'x=' + rect.x + ', y=' + rect.y);
    }

    console.groupEnd();
  }

  function getPlayerTime() {
    var bridge = document.getElementById('ytm-ext-player-bridge');
    if (bridge && bridge.dataset.time) {
      return parseFloat(bridge.dataset.time);
    }
    var video = document.querySelector('video');
    return video ? video.currentTime : 0;
  }

  function getPlayerDuration() {
    var bridge = document.getElementById('ytm-ext-player-bridge');
    if (bridge && bridge.dataset.duration) {
      var d = parseFloat(bridge.dataset.duration);
      return (Number.isFinite(d) && d > 0) ? d : null;
    }
    return null;
  }

  function seekPlayer(time) {
    document.dispatchEvent(new CustomEvent('ytm-ext-seek', { detail: { time: time } }));
  }

  function getSongTitle() {
    const title = document.querySelector('.content-info-wrapper .title');
    if (title) return title.textContent.trim();

    // Fallback: parse document.title "Song - Artist - YouTube Music"
    const parts = document.title.split(' - ');
    return parts[0]?.trim() || '';
  }

  function getArtistName() {
    const artist = document.querySelector('.content-info-wrapper .subtitle a');
    if (artist) return artist.textContent.trim();

    const parts = document.title.split(' - ');
    return parts[1]?.trim() || '';
  }

  function parseLRC(lrcText) {
    return lrcText.split('\n')
      .map(line => {
        const match = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
        if (!match) return null;

        const minutes = parseInt(match[1]);
        const seconds = parseFloat(match[2]);
        const time = minutes * 60 + seconds;
        const text = match[3].trim();

        return { time, text };
      })
      .filter(line => line && line.text);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderSyncedLyrics(originalElement, lyrics) {
    // Find the shelf renderer (parent container for lyrics)
    const shelfRenderer = originalElement.closest('ytmusic-description-shelf-renderer');
    if (!shelfRenderer) {
      console.error('[YTM-Ext] Could not find shelf renderer');
      return;
    }

    let syncedContainer = document.getElementById('ytm-ext-synced-lyrics');
    if (!syncedContainer) {
      syncedContainer = document.createElement('div');
      syncedContainer.id = 'ytm-ext-synced-lyrics';
      shelfRenderer.appendChild(syncedContainer);
    }

    // Hide ALL original content in shelfRenderer (except our container)
    Array.from(shelfRenderer.children).forEach(child => {
      if (child.id !== 'ytm-ext-synced-lyrics') {
        child.style.display = 'none';
      }
    });

    // Apple Music style container
    syncedContainer.style.cssText = 'display:block !important; width:100%; color:#fff; font-size:28px; line-height:2.2;';

    syncedContainer.innerHTML = lyrics
      .map((line, i) => `<div class="synced-line" data-time="${line.time}" data-index="${i}">${escapeHtml(line.text)}</div>`)
      .join('');

    const rect = syncedContainer.getBoundingClientRect();
    console.log('[YTM-Ext] Container rect:', rect.width, 'x', rect.height, 'at', rect.x, rect.y);
    console.log('[YTM-Ext] Parent:', syncedContainer.parentElement?.tagName);

    // Add click-to-seek (remove old handler to prevent accumulation)
    if (lyricsClickHandler) {
      syncedContainer.removeEventListener('click', lyricsClickHandler);
    }
    lyricsClickHandler = function(e) {
      if (e.target.classList.contains('synced-line')) {
        e.preventDefault();
        e.stopPropagation();
        if (!isVideoReady) {
          console.log('[YTM-Ext] Click ignored - video not ready yet');
          return;
        }
        const lyricTime = parseFloat(e.target.dataset.time);
        seekPlayer(lyricTime);
        console.log('[YTM-Ext] Seeking to time:', lyricTime);
      }
    };
    syncedContainer.addEventListener('click', lyricsClickHandler);

    // If in fullscreen, move lyrics to fullscreen container
    if (isFullscreen) {
      const fullscreenWrapper = document.querySelector('#ytm-ext-fullscreen-lyrics');
      if (fullscreenWrapper && syncedContainer.parentElement !== fullscreenWrapper) {
        originalLyricsParent = syncedContainer.parentElement;
        fullscreenWrapper.appendChild(syncedContainer);
        // Scroll to current position based on player time
        const time = getPlayerTime();
        const lines = syncedContainer.querySelectorAll('.synced-line');
        for (let i = 0; i < lines.length; i++) {
          const lineTime = parseFloat(lines[i].dataset.time);
          if (lineTime <= time) {
            lines[i].scrollIntoView({ behavior: 'auto', block: 'center' });
          }
        }
      }
    }
  }

  let syncInterval = null;

  function startSync(lyrics, sessionId) {
    console.log('[YTM-Ext] Starting lyrics sync, first lyric at:', lyrics[0]?.time, 'session:', sessionId);

    // Clear previous interval if exists
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }

    let currentIndex = null;
    let handlerCallCount = 0;

    function updateSync() {
      // Abort if session has changed (new song started)
      if (syncSessionId !== sessionId) {
        console.log('[YTM-Ext] Sync session expired, stopping');
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        return;
      }

      const time = getPlayerTime();
      handlerCallCount++;

      // Log first few calls
      if (handlerCallCount <= 3) {
        console.log('[YTM-Ext] sync tick #' + handlerCallCount + ', time:', time.toFixed(2));
      }

      // Find current line
      let index = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].time <= time) {
          index = i;
        } else {
          break;
        }
      }

      if (index !== currentIndex) {
        const prevIndex = currentIndex;
        currentIndex = index;
        lyricsCurrentIndex = index;

        const container = document.getElementById('ytm-ext-synced-lyrics');
        if (container) {
          const lines = container.querySelectorAll('.synced-line');
          lines.forEach((el, i) => {
            const isCurrent = i === index;
            el.classList.toggle('current', isCurrent);
            el.style.filter = isCurrent ? 'blur(0)' : 'blur(2px)';
            el.style.opacity = isCurrent ? '1' : '0.35';
            el.style.transform = isCurrent ? 'scale(1)' : 'scale(0.95)';
            el.style.fontWeight = isCurrent ? '600' : 'normal';
            el.style.textShadow = isCurrent ? '0 0 10px rgba(255,255,255,0.3)' : 'none';
          });

          // Scroll to keep current line visible (skip during fullscreen transition)
          if (index >= 0 && !isTransitioningFullscreen) {
            const currentEl = container.querySelector('.synced-line.current');
            if (currentEl) {
              // Small jump (1-2 lines) → smooth. Large jump (tab switch, seek) → instant.
              const delta = prevIndex !== null ? Math.abs(index - prevIndex) : 999;
              currentEl.scrollIntoView({ behavior: delta <= 2 ? 'smooth' : 'instant', block: 'center' });
            }
          }
        }
      }
    }

    // Enable click-to-seek and start sync
    isVideoReady = true;
    syncInterval = setInterval(updateSync, 200);
    updateSync();
    console.log('[YTM-Ext] Sync started');
  }

  async function enhanceLyrics(element) {
    // Mark as processed
    element.dataset.synced = 'processing';
    console.log('[YTM-Ext] enhanceLyrics called');

    const title = getSongTitle();
    const artist = getArtistName();
    console.log('[YTM-Ext] Song:', title, 'Artist:', artist);

    if (!title) {
      element.dataset.synced = 'failed';
      console.log('[YTM-Ext] No title found, aborting');
      return;
    }

    // Capture session ID to detect stale async work
    const mySessionId = syncSessionId;

    try {
      // Get duration from player bridge (correct per-song value, not MSE cumulative)
      let duration = getPlayerDuration();
      console.log('[YTM-Ext] Player duration:', duration);

      // Request synced lyrics from background
      console.log('[YTM-Ext] Fetching lyrics from LRCLIB... (duration:', duration, ')');
      const syncedLyrics = await chrome.runtime.sendMessage({
        action: 'FETCH_LYRICS',
        title,
        artist,
        duration
      });

      // Abort if song changed while fetching
      if (syncSessionId !== mySessionId) {
        console.log('[YTM-Ext] Session expired during lyrics fetch, aborting');
        return;
      }

      console.log('[YTM-Ext] Got response:', syncedLyrics ? 'lyrics found' : 'no lyrics');

      if (syncedLyrics) {
        const parsed = parseLRC(syncedLyrics);
        console.log('[YTM-Ext] Parsed', parsed.length, 'lines');
        if (parsed.length > 0) {
          console.log('[YTM-Ext] First 3 lines:', parsed.slice(0, 3));
          renderSyncedLyrics(element, parsed);
          // Use requestAnimationFrame to ensure DOM is ready before syncing
          requestAnimationFrame(() => {
            startSync(parsed, mySessionId);
          });
          element.dataset.synced = 'true';
          lyricsState = 'synced';
          currentSongHasLyrics = true;
          console.log('[YTM-Ext] Sync started successfully, lyricsState: synced');
          return;
        }
      }
    } catch (error) {
      console.error('[YTM-Ext] Lyrics sync error:', error);
    }

    // Keep original lyrics if sync fails - check if plain lyrics exist
    element.dataset.synced = 'failed';
    console.log('[YTM-Ext] Sync failed, checking for plain lyrics');

    // Check if plain lyrics exist
    const plainLyricsText = element.textContent?.trim() || '';
    if (plainLyricsText.length > 50) {
      lyricsState = 'plain';
      currentSongHasLyrics = true;
      console.log('[YTM-Ext] Plain lyrics found, lyricsState: plain');
    } else {
      lyricsState = 'none';
      currentSongHasLyrics = false;
      console.log('[YTM-Ext] No lyrics found, lyricsState: none');
    }

    // Re-enable click-to-seek even without synced lyrics
    if (syncSessionId === mySessionId) {
      isVideoReady = true;
    }
  }

  function checkSongChange() {
    const newTitle = getSongTitle();
    if (newTitle && newTitle !== currentSongTitle) {
      console.log('[YTM-Ext] Song changed:', currentSongTitle, '->', newTitle);
      currentSongTitle = newTitle;
      lyricsCurrentIndex = -1; // Reset current index for new song
      isVideoReady = false;
      syncSessionId++;
      console.log('[YTM-Ext] Song changed, disabling click-to-seek, session:', syncSessionId);

      // Clear old sync interval
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }

      // Remove old container so it gets recreated
      const oldContainer = document.getElementById('ytm-ext-synced-lyrics');
      if (oldContainer) {
        oldContainer.remove();
      }

      // Update fullscreen album art if in fullscreen
      if (isFullscreen) {
        updateFullscreenAlbumArt();
      }

      // Update unified album art
      updateUnifiedAlbumArt();

      // Reset synced state on lyrics element
      const lyricsElement = document.querySelector(
        'ytmusic-tab-renderer:not([page-type="MUSIC_PAGE_TYPE_TRACK_RELATED"]) ytmusic-description-shelf-renderer yt-formatted-string.description'
      );
      if (lyricsElement) {
        delete lyricsElement.dataset.synced;
        lyricsElement.style.cssText = ''; // Unhide it
        enhanceLyrics(lyricsElement);
        
        // If in fullscreen, move lyrics and scroll after enhanceLyrics completes
        if (isFullscreen) {
          setTimeout(() => {
            const lyrics = document.getElementById('ytm-ext-synced-lyrics');
            const fullscreenWrapper = document.querySelector('#ytm-ext-fullscreen-lyrics');
            if (lyrics && fullscreenWrapper && lyrics.parentElement !== fullscreenWrapper) {
              originalLyricsParent = lyrics.parentElement;
              fullscreenWrapper.appendChild(lyrics);
            }
            // Don't scroll - keep at current position
          }, 200);
        }
      }
    }
  }

  function initLyricsSync() {
    if (lyricsObserver) return;

    // Watch for lyrics panel to appear AND song changes
    lyricsObserver = new MutationObserver(() => {
      // Check for song changes
      checkSongChange();

      // Check for new lyrics element
      const lyricsElement = document.querySelector(
        'ytmusic-tab-renderer:not([page-type="MUSIC_PAGE_TYPE_TRACK_RELATED"]) ytmusic-description-shelf-renderer yt-formatted-string.description'
      );
      if (lyricsElement && !lyricsElement.dataset.synced) {
        currentSongTitle = getSongTitle();
        enhanceLyrics(lyricsElement);
      }
    });

    lyricsObserver.observe(document.body, { childList: true, subtree: true });

    // Also check immediately
    const lyricsElement = document.querySelector(
      'ytmusic-tab-renderer:not([page-type="MUSIC_PAGE_TYPE_TRACK_RELATED"]) ytmusic-description-shelf-renderer yt-formatted-string.description'
    );
    if (lyricsElement && !lyricsElement.dataset.synced) {
      currentSongTitle = getSongTitle();
      enhanceLyrics(lyricsElement);
      
      // If already in fullscreen, move lyrics there
      if (isFullscreen) {
        setTimeout(() => {
          const lyrics = document.getElementById('ytm-ext-synced-lyrics');
          const fullscreenWrapper = document.querySelector('#ytm-ext-fullscreen-lyrics');
          if (lyrics && fullscreenWrapper && lyrics.parentElement !== fullscreenWrapper) {
            originalLyricsParent = lyrics.parentElement;
            fullscreenWrapper.appendChild(lyrics);
          }
        }, 200);
      }
    }
  }

  // ============================================
  // FULLSCREEN MODE
  // ============================================

  // Helper function to scroll to current lyric by index
  function scrollToCurrentLyric() {
    const lyrics = document.getElementById('ytm-ext-synced-lyrics');
    if (!lyrics || lyricsCurrentIndex < 0) return;

    const lines = lyrics.querySelectorAll('.synced-line');
    if (lines[lyricsCurrentIndex]) {
      lines[lyricsCurrentIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }

  function createFullscreenUI() {
    if (fullscreenContainer) return;

    // Hide YouTube's native player panels
    const mainPanel = document.querySelector('ytmusic-player-page #main-panel');
    const playerPage = document.querySelector('#player-page');
    if (mainPanel) { mainPanel.style.setProperty('opacity', '0', 'important'); mainPanel.style.setProperty('pointer-events', 'none', 'important'); }
    if (playerPage) { playerPage.style.setProperty('opacity', '0', 'important'); playerPage.style.setProperty('pointer-events', 'none', 'important'); }

    // Save scroll position before switching
    const lyrics = document.getElementById('ytm-ext-synced-lyrics');
    if (lyrics) {
      lyricsScrollPosition = lyrics.scrollTop;
    }

    fullscreenContainer = document.createElement('div');
    fullscreenContainer.id = 'ytm-ext-fullscreen';

    const artUrl = getAlbumArtUrl();
    
    fullscreenContainer.innerHTML = `
      <div class="fs-layout">
        <div class="fs-album">
          <img src="${artUrl || ''}" alt="Album Art">
        </div>
        <div class="fs-lyrics" id="ytm-ext-fullscreen-lyrics"></div>
      </div>
    `;

    document.body.appendChild(fullscreenContainer);

    // Move lyrics to our container
    const lyricsEl = document.getElementById('ytm-ext-synced-lyrics');
    if (lyricsEl) {
      isTransitioningFullscreen = true;
      originalLyricsParent = lyricsEl.parentElement;
      const lyricsWrapper = fullscreenContainer.querySelector('#ytm-ext-fullscreen-lyrics');
      lyricsWrapper.appendChild(lyricsEl);
    }

    document.body.classList.add('fullscreen-active');

    // Auto-collapse lyrics panel if no lyrics available
    if (lyricsState === 'none') {
      document.body.classList.add('sidebar-collapsed');
      console.log('[YTM-Ext:Fullscreen] No lyrics, auto-collapsing sidebar');
    }

    // After CSS is applied, scroll current line into view (no animation)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const lyricsEl = document.getElementById('ytm-ext-synced-lyrics');
        if (lyricsEl && lyricsCurrentIndex >= 0) {
          const lines = lyricsEl.querySelectorAll('.synced-line');
          if (lines[lyricsCurrentIndex]) {
            lines[lyricsCurrentIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }
        isTransitioningFullscreen = false;
      });
    });
  }

  function removeFullscreenUI() {
    isTransitioningFullscreen = false;

    // Restore YouTube's native player panels
    const mainPanel = document.querySelector('ytmusic-player-page #main-panel');
    const playerPage = document.querySelector('#player-page');
    if (mainPanel) { mainPanel.style.removeProperty('opacity'); mainPanel.style.removeProperty('pointer-events'); }
    if (playerPage) { playerPage.style.removeProperty('opacity'); playerPage.style.removeProperty('pointer-events'); }

    // Move lyrics back to original parent
    const lyricsEl = document.getElementById('ytm-ext-synced-lyrics');
    if (lyricsEl && originalLyricsParent) {
      isTransitioningFullscreen = true;
      originalLyricsParent.appendChild(lyricsEl);
      originalLyricsParent = null;
    }

    if (fullscreenContainer) {
      fullscreenContainer.remove();
      fullscreenContainer = null;
    }
    document.body.classList.remove('fullscreen-active');

    // After CSS is applied, scroll current line into view (no animation)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const lyricsEl = document.getElementById('ytm-ext-synced-lyrics');
        if (lyricsEl && lyricsCurrentIndex >= 0) {
          const lines = lyricsEl.querySelectorAll('.synced-line');
          if (lines[lyricsCurrentIndex]) {
            lines[lyricsCurrentIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }
        isTransitioningFullscreen = false;
      });
    });
  }

  function updateFullscreenAlbumArt() {
    if (!fullscreenContainer) return;
    const img = fullscreenContainer.querySelector('.fs-album img');
    const artUrl = getAlbumArtUrl();
    if (img && artUrl) {
      img.src = artUrl;
    }
  }

  function isVideoMode() {
    const songImg = document.querySelector('ytmusic-player #song-image');
    if (!songImg) return false;
    return window.getComputedStyle(songImg).display === 'none';
  }

  let fullscreenInitialized = false;
  function initFullscreen() {
    if (fullscreenInitialized) return;
    fullscreenInitialized = true;
    document.addEventListener('fullscreenchange', () => {
      isFullscreen = !!document.fullscreenElement;
      if (isFullscreen) {
        if (!isVideoModeV2()) {
          createFullscreenUI();
        }
      } else {
        removeFullscreenUI();
      }
    });
  }

  // ============================================
  // UNIFIED ALBUM ART
  // ============================================

  function isVideoModeV2() {
    const videoElement = document.querySelector('ytmusic-player video');
    if (!videoElement) {
      return false;
    }

    const rect = videoElement.getBoundingClientRect();
    const computed = window.getComputedStyle(videoElement);

    const isVideo = rect.width > 100 &&
                    rect.height > 100 &&
                    computed.visibility !== 'hidden' &&
                    computed.opacity !== '0';

    return isVideo;
  }

  function createUnifiedAlbumArt() {
    console.log('[YTM-Ext:UnifiedArt] createUnifiedAlbumArt() called');

    if (document.getElementById('ytm-ext-unified-art')) {
      console.log('[YTM-Ext:UnifiedArt] Container already exists, skipping');
      return;
    }

    const container = document.createElement('div');
    container.id = 'ytm-ext-unified-art';
    container.classList.add('hidden');

    const wrapper = document.createElement('div');
    wrapper.id = 'ytm-ext-art-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    const img = document.createElement('img');
    img.id = 'ytm-ext-unified-art-img';
    img.alt = 'Album Art';

    wrapper.appendChild(img);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    console.log('[YTM-Ext:UnifiedArt] Container created and added to body');

    updateUnifiedAlbumArt();
  }

  function updateUnifiedAlbumArt() {
    const container = document.getElementById('ytm-ext-unified-art');
    const img = document.getElementById('ytm-ext-unified-art-img');

    if (!container) {
      return;
    }
    if (!img) {
      return;
    }

    // Move player buttons into art wrapper (for positioning relative to image)
    const wrapper = document.getElementById('ytm-ext-art-wrapper');
    const playerButtons = document.querySelector('.top-row-buttons');
    if (playerButtons && wrapper && !wrapper.contains(playerButtons)) {
      wrapper.appendChild(playerButtons);
    }

    // Check video mode FIRST
    const isVideo = isVideoModeV2();
    if (isVideo) {
      container.classList.add('hidden');
      document.body.classList.add('video-mode');
      return;
    }
    document.body.classList.remove('video-mode');

    const url = getAlbumArtUrl();
    if (!url) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    // Skip if same URL or crossfade already in progress
    if (img.src === url) {
      return;
    }
    if (isCrossfading) return;

    isCrossfading = true;
    img.classList.add('fading-out');

    setTimeout(() => {
      img.src = url;
      img.onload = () => {
        img.classList.remove('fading-out');
        isCrossfading = false;
      };
      img.onerror = (e) => {
        console.error('[YTM-Ext:UnifiedArt] Image failed to load!', e);
        img.classList.remove('fading-out');
        isCrossfading = false;
      };
    }, 300);
  }

  // ============================================
  // SIDEBAR TOGGLE
  // ============================================

  function createSidebarToggle() {
    console.log('[YTM-Ext:Sidebar] createSidebarToggle() called');

    if (document.getElementById('ytm-ext-sidebar-toggle')) {
      console.log('[YTM-Ext:Sidebar] Toggle already exists, skipping');
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'ytm-ext-sidebar-toggle';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    document.body.appendChild(btn);

    console.log('[YTM-Ext:Sidebar] Toggle button created');

    const collapsed = localStorage.getItem('ytm-ext-sidebar-collapsed') === 'true';
    console.log('[YTM-Ext:Sidebar] Saved state:', collapsed ? 'collapsed' : 'expanded');

    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      console.log('[YTM-Ext:Sidebar] Applied collapsed state from localStorage');
    }

    btn.addEventListener('click', toggleSidebar);
    console.log('[YTM-Ext:Sidebar] Click handler attached');
  }

  function toggleSidebar() {
    console.log('[YTM-Ext:Sidebar] toggleSidebar() called');

    const wasCollapsed = document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');

    console.log('[YTM-Ext:Sidebar] State changed:', wasCollapsed ? 'collapsed' : 'expanded', '->', isCollapsed ? 'collapsed' : 'expanded');

    localStorage.setItem('ytm-ext-sidebar-collapsed', isCollapsed);
    console.log('[YTM-Ext:Sidebar] Saved to localStorage:', isCollapsed);

    // If expanding, instantly scroll lyrics to current position after CSS applies
    if (wasCollapsed && !isCollapsed) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToCurrentLyric();
        });
      });
    }
  }

  // ============================================
  // VISIBILITY SCROLL FIX (Comet browser: only document.hidden polling works)
  // ============================================

  function initVisibilityScrollFix() {
    if (visibilityScrollInterval) clearInterval(visibilityScrollInterval);
    let wasHidden = document.hidden;

    visibilityScrollInterval = setInterval(() => {
      const isHidden = document.hidden;
      if (wasHidden && !isHidden) {
        requestAnimationFrame(() => scrollToCurrentLyric());
      }
      wasHidden = isHidden;
    }, 100);
  }

  // ============================================
  // DEBUG INTERFACE
  // ============================================

  window.ytmExtDebug = {
    verify: verifyUnifiedArtState,
    toggleSidebar: toggleSidebar,
    updateArt: updateUnifiedAlbumArt,
    getState: () => ({
      sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
      fullscreenActive: document.body.classList.contains('fullscreen-active'),
      videoMode: document.body.classList.contains('video-mode'),
      hasLyrics: currentSongHasLyrics,
      lyricsState: lyricsState
    })
  };

  console.log('[YTM-Ext] Debug functions available: window.ytmExtDebug.verify(), .toggleSidebar(), .updateArt(), .getState()');

  function init() {
    console.log('[YTM-Ext] Initializing extension...');

    // Track initial page state for slide-in animation
    wasOnWatchPage = isNowPlayingPage();

    // Run pre-flight checks
    if (!preFlightCheck()) {
      console.error('[YTM-Ext] Pre-flight failed, some features may not work');
    }

    loadSettings();
    checkAndUpdate();
    addYouTubeLink();
    addMiniPlayerButton();

    // New unified album art and sidebar
    createUnifiedAlbumArt();
    createSidebarToggle();

    initObserver();
    initUrlObserver();
    initLyricsSync();
    initFullscreen();
    initMiniPlayerAutoClose();
    initVisibilityScrollFix();
    initKeyboardShortcuts();

    // Update unified album art periodically (clear any existing interval first)
    if (mainUpdateInterval) clearInterval(mainUpdateInterval);
    mainUpdateInterval = setInterval(() => {
      checkAndUpdate();
      updateUnifiedAlbumArt();
    }, 2000);

    console.log('[YTM-Ext] Extension initialized successfully');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
