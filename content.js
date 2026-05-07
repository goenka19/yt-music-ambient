(function() {
  'use strict';

  // Prevent multiple init calls on extension reload
  if (window.__ytmExtLoaded) return;
  window.__ytmExtLoaded = true;

  let ambientContainer = null;
  let currentArtUrl = null;
  let preloadedFullscreenImg = null; // Preloaded image for fullscreen album art
  let ambientCanvas = null;
  let ambientAnimFrame = null;
  let ambientImg = null;
  let ambientLastFrame = 0;
  let ambientPhases = null;
  let ambientPalette = null;
  let ambientImageLuminance = 0.5;
  let endOfSongActive = false;
  let endOfSongVideoId = null;
  let observer = null;
  let mainUpdateInterval = null;
  let miniPlayerAutoCloseInterval = null;
  let lyricsTransitionInterval = null;
  let settings = {
    ambientEnabled: true,
    animatedEnabled: false,
    shiftUpEnabled: false,
    reducedSizeEnabled: false
  };
  let originalButtonsParent = null;

  // Named event listener references (for proper removal in destroyExtension)
  let storageChangeHandler = null;
  let urlChangeHandler = null;
  let visibilityChangeHandler = null;
  let keydownHandler = null;
  let fullscreenChangeHandler = null;
  let mousemoveHandler = null;
  let resizeHandler = null;
  let lyricsTabClickHandler = null;

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
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return;
    }
    chrome.storage.local.get(['ambientEnabled', 'animatedEnabled', 'shiftUpEnabled', 'reducedSizeEnabled'], (data) => {
      settings.ambientEnabled = data.ambientEnabled !== false; // default true
      settings.animatedEnabled = data.animatedEnabled === true; // default false
      settings.shiftUpEnabled = data.shiftUpEnabled === true; // default false
      settings.reducedSizeEnabled = data.reducedSizeEnabled === true; // default false
      applySettings();
    });
  }

  // Listen for settings changes
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    storageChangeHandler = (changes, namespace) => {
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
    };
    chrome.storage.onChanged.addListener(storageChangeHandler);
  }

  // Apply settings to DOM
  function applySettings() {
    updatePageState();
    if (ambientContainer) {
      ambientContainer.classList.toggle('animated', settings.animatedEnabled);
    }
    if (settings.animatedEnabled) {
      if (ambientImg) startAmbientAnimation();
    } else {
      stopAmbientAnimation();
    }
    document.body.classList.toggle('layout-shift-up', settings.shiftUpEnabled);
    document.body.classList.toggle('layout-reduced-size', settings.reducedSizeEnabled);
  }

  // Check if on now-playing page
  function isNowPlayingPage() {
    return window.location.pathname.includes('/watch');
  }

  // YouTube's player gets .ad-showing during pre-roll/mid-roll ads
  function isAdPlaying() {
    return !!document.querySelector('#movie_player.ad-showing');
  }

  // Update page state based on URL and settings
  function updatePageState() {
    const onWatch = isNowPlayingPage();
    const isSettled = document.body.classList.contains('ytm-ext-settled');
    const containerShouldShow = settings.ambientEnabled && onWatch && !isAdPlaying();
    // ambient-active makes YouTube backgrounds transparent — only apply once the
    // player animation has settled (ytm-ext-settled), to avoid a flash on the
    // home screen while the player is still sliding in.
    const shouldShowAmbient = containerShouldShow && isSettled;
    document.body.classList.toggle('ambient-active', shouldShowAmbient);
    document.body.classList.toggle('ytm-ext-active', onWatch && settings.ambientEnabled);
    if (!onWatch) document.body.classList.remove('ytm-ext-settled');

    if (ambientContainer && !document.body.classList.contains('video-fullscreen')) {
      ambientContainer.style.display = containerShouldShow ? 'block' : 'none';
    }
  }

  function getAlbumArtUrlRaw() {
    for (const selector of ALBUM_ART_SELECTORS) {
      const img = document.querySelector(selector);
      if (img && img.src) {
        return img.src;
      }
    }
    return null;
  }

  function getAlbumArtUrl() {
    const rawUrl = getAlbumArtUrlRaw();
    if (!rawUrl) return null;
    let url = rawUrl;
    url = url.replace(/=w\d+-h\d+/, '=w1200-h1200');
    url = url.replace(/=s\d+/, '=s1200');
    return url;
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

    ambientCanvas = document.createElement('canvas');
    ambientCanvas.className = 'ambient-canvas';
    ambientContainer.appendChild(ambientCanvas);

    document.body.prepend(ambientContainer);
    applySettings();
  }

  function updateBackground(artUrl) {
    if (!artUrl || artUrl === currentArtUrl) return;

    currentArtUrl = artUrl;
    ambientPhases = null;
    createAmbientBackground();

    const img = new Image();
    img.onload = function() {
      if (ambientContainer) {
        const layers = ambientContainer.querySelectorAll('.ambient-layer');
        layers.forEach(layer => {
          layer.style.backgroundImage = `url('${artUrl}')`;
        });
      }
      extractPalette(img);
      ambientImg = img;
      if (settings.animatedEnabled) startAmbientAnimation();
    };
    img.crossOrigin = 'anonymous';
    img.src = artUrl;
  }

  function extractPalette(img) {
    const size = 40;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const pixels = [];
    let totalLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = (max - min) / 255;
      pixels.push({ r, g, b, lum, chroma });
      totalLum += lum;
    }
    ambientImageLuminance = totalLum / (pixels.length);

    // Filter near-gray pixels
    const vivid = pixels.filter(p => p.chroma > 0.04);
    const pool = vivid.length >= 5 ? vivid : pixels;

    // K-means-like: pick 5 diverse centroids
    const centroids = [];
    const used = new Set();
    for (let k = 0; k < 5; k++) {
      let bestIdx = -1, bestDist = -1;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        if (centroids.length === 0) { bestIdx = i; break; }
        let minDist = Infinity;
        for (const c of centroids) {
          const dr = pool[i].r - c.r, dg = pool[i].g - c.g, db = pool[i].b - c.b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) minDist = dist;
        }
        if (minDist > bestDist) { bestDist = minDist; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        used.add(bestIdx);
        centroids.push(pool[bestIdx]);
      }
    }

    // Handle insufficient distinct colors
    while (centroids.length < 5) {
      const base = centroids[centroids.length - 1] || { r: 40, g: 40, b: 40 };
      const hueShift = (centroids.length * 30) % 360;
      const r = Math.min(255, Math.max(20, base.r + (centroids.length % 2 ? 25 : -25)));
      centroids.push({ r, g: base.g, b: base.b, lum: base.lum, chroma: base.chroma });
    }

    // Boost darkest entry if album is very dark
    if (ambientImageLuminance < 0.10) {
      centroids.sort((a, b) => a.lum - b.lum);
      const d = centroids[0];
      centroids[0] = { ...d, r: Math.min(255, d.r + 35), g: Math.min(255, d.g + 35), b: Math.min(255, d.b + 35), lum: Math.min(1, d.lum + 0.14) };
    }

    // If album is desaturated, add subtle warm/cool tint
    const avgChroma = centroids.reduce((s, c) => s + (c.chroma || 0), 0) / centroids.length;
    if (avgChroma < 0.08) {
      centroids[1] = { ...centroids[1], r: Math.min(255, centroids[1].r + 15), b: Math.max(0, centroids[1].b - 10) };
      centroids[3] = { ...centroids[3], b: Math.min(255, centroids[3].b + 15), r: Math.max(0, centroids[3].r - 10) };
    }

    ambientPalette = centroids;
    applyAmbientFilters();
  }

  function applyAmbientFilters() {
    const lum = ambientImageLuminance != null ? ambientImageLuminance : 0.5;

    let brightness, saturate;
    if (lum < 0.15)      { brightness = 0.75; saturate = 1.3; }
    else if (lum < 0.25) { brightness = 0.68; saturate = 1.4; }
    else if (lum < 0.35) { brightness = 0.60; saturate = 1.5; }
    else if (lum < 0.50) { brightness = 0.50; saturate = 1.6; }
    else if (lum < 0.70) { brightness = 0.40; saturate = 1.7; }
    else                 { brightness = 0.30; saturate = 1.7; }

    if (ambientCanvas) {
      ambientCanvas.style.filter = `blur(50px) saturate(${saturate}) brightness(${brightness})`;
    }
    if (ambientContainer) {
      const layers = ambientContainer.querySelectorAll('.ambient-layer');
      layers.forEach(l => {
        l.style.filter = `blur(50px) saturate(${saturate}) brightness(${brightness})`;
      });
    }
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

        if (!wasWatch && isNowPlayingPage()) {
          // Ensure elements exist before we animate them
          createUnifiedAlbumArt();
          createSidebarToggle();

          // Add slide-in SYNCHRONOUSLY before updatePageState() adds ytm-ext-active
          // (which makes elements visible). First paint shows them at translateY(100vh),
          // matching YouTube's own open-player-page animation (0.3s cubic-bezier(0.2,0,0.6,1)).
          const art = document.getElementById('ytm-ext-unified-art');
          const sidebar = document.getElementById('ytm-ext-sidebar-toggle');
          [art, sidebar].forEach(el => {
            if (el) {
              el.classList.add('slide-in');
              el.addEventListener('animationend', () => el.classList.remove('slide-in'), { once: true });
            }
          });

          // Settle exactly when YouTube's slide animation ends.
          // ambient-active makes YouTube backgrounds transparent — must not fire before
          // the animation or the home screen background flashes.
          let settled = false;
          let settle = () => {
            if (settled || !isNowPlayingPage()) return;
            settled = true;
            document.body.classList.add('ytm-ext-settled');
            updatePageState();
          };
          const playerPage = document.querySelector('ytmusic-player-page');
          if (playerPage) {
            const onTransEnd = function(e) {
              if (e.propertyName === 'transform') {
                playerPage.removeEventListener('transitionend', onTransEnd);
                settle();
              }
            };
            playerPage.addEventListener('transitionend', onTransEnd);
            // If transitionend never fires, ensure we don't leak listeners across repeated navigations.
            const settleOnce = settle;
            settle = () => {
              playerPage.removeEventListener('transitionend', onTransEnd);
              settleOnce();
            };
          }
          setTimeout(settle, 400); // fallback if transitionend never fires
        }

        if (wasWatch && !isNowPlayingPage()) {
          // Hide #av-id before ytm-ext-active is removed so the
          // position:fixed → in-flow snap is never visible.
          const avId = document.querySelector('#av-id');
          if (avId) {
            avId.style.opacity = '0';
            setTimeout(() => { avId.style.opacity = ''; }, 400);
          }
        }

        updatePageState();
        checkAndUpdate();
        if (isNowPlayingPage() && wasWatch) {
          // Already on watch (song change etc.): refresh elements, no animation needed
          createUnifiedAlbumArt();
          createSidebarToggle();
          updateUnifiedAlbumArt();
        } else if (isNowPlayingPage()) {
          updateUnifiedAlbumArt();
        }
      }
    }

    // Listen for history API changes from player-bridge.js (page context)
    urlChangeHandler = onUrlChange;
    document.addEventListener('ytm-ext-url-change', urlChangeHandler);

    // Keep MutationObserver as fallback
    urlObserver = new MutationObserver(onUrlChange);
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  function addYouTubeLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    const existing = document.getElementById('yt-music-open-yt');
    if (!videoId) {
      if (existing) existing.remove();
      return;
    }

    if (existing) {
      const nextHref = `https://www.youtube.com/watch?v=${videoId}`;
      if (existing.href !== nextHref) {
        existing.href = nextHref;
        existing.dataset.videoId = videoId;
      }
      return;
    }

    const rightControls = document.querySelector('ytmusic-player-bar .right-controls-buttons');
    if (!rightControls) return;

    const btn = document.createElement('a');
    btn.id = 'yt-music-open-yt';
    btn.href = `https://www.youtube.com/watch?v=${videoId}`;
    btn.dataset.videoId = videoId;
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
  let pipWindowOpening = false; // Guard against concurrent open attempts
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
          img.onerror = () => {};
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
    if (pipWindowOpening) return;
    pipWindowOpening = true;

    try {
      pipWindow = await documentPictureInPicture.requestWindow({
        width: 200,
        height: 200
      });
      pipWindowOpening = false;

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
          <div class="ytm-ext-pip-title" id="ytm-ext-pip-title">${escapeHtml(title)}</div>
          <div class="ytm-ext-pip-artist" id="ytm-ext-pip-artist">${escapeHtml(artist)}</div>
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
      pipWindowOpening = false;
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

  // ============================================
  // EQUALIZER AUDIO ENGINE
  // ============================================

  let audioCtx = null;
  let audioSource = null;
  let filters = [];
  let eqEnabled = true;
  let eqInitialized = false;
  let currentVideoId = null;
  let currentPresetName = 'Custom';
  let saveTimeout = null;
  let globalSaveTimeout = null;
  let songObserverInterval = null;
  let bypassGain = null;
  let eqGain = null;

  const EQ_BANDS = [
    { type: 'lowshelf', freq: 60, label: '60Hz', q: 1 },
    { type: 'peaking', freq: 250, label: '250Hz', q: 1 },
    { type: 'peaking', freq: 1000, label: '1kHz', q: 1 },
    { type: 'peaking', freq: 4000, label: '4kHz', q: 1 },
    { type: 'highshelf', freq: 16000, label: '16kHz', q: 1 }
  ];

  const EQ_PRESETS = {
    'Flat': [0, 0, 0, 0, 0],
    'Bass Boost': [6, 4, 0, 0, 0],
    'Treble Boost': [0, 0, 0, 4, 6],
    'Vocal': [-2, 0, 4, 2, -1],
    'Electronic': [5, 2, -2, 2, 5],
    'Rock': [4, 2, -1, 2, 4],
    'Jazz': [3, 0, 2, 3, 4]
  };

  function findVideoElement() {
    return document.querySelector('video');
  }

  function getCurrentVideoId() {
    const params = new URLSearchParams(window.location.search);
    const urlVideoId = params.get('v');
    if (urlVideoId) return urlVideoId;

    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      return playerBar.getAttribute('video-id') || null;
    }
    return null;
  }

  function initAudioEngine() {
    if (eqInitialized) {
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume();
      }
      return true;
    }

    const video = findVideoElement();
    if (!video) {
      return false;
    }

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      audioSource = audioCtx.createMediaElementSource(video);

      filters = EQ_BANDS.map((band, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = band.q || 1;
        filter.gain.value = 0;
        return filter;
      });

      bypassGain = audioCtx.createGain();
      bypassGain.gain.value = 1;

      eqGain = audioCtx.createGain();
      eqGain.gain.value = 0;

      let lastNode = audioSource;
      filters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });
      lastNode.connect(eqGain);
      eqGain.connect(audioCtx.destination);

      audioSource.connect(bypassGain);
      bypassGain.connect(audioCtx.destination);

      eqInitialized = true;

      syncAudioPath();
      loadEqSettings();
      return true;
    } catch (error) {
      console.error('[YTM-Ext:EQ] Failed to initialize audio engine:', error);
      return false;
    }
  }

  function syncAudioPath() {
    if (!audioCtx || !bypassGain || !eqGain) return;
    const now = audioCtx.currentTime;
    if (eqEnabled) {
      bypassGain.gain.setTargetAtTime(0, now, 0.05);
      eqGain.gain.setTargetAtTime(1, now, 0.05);
    } else {
      bypassGain.gain.setTargetAtTime(1, now, 0.05);
      eqGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  function setEqBand(bandIndex, gain) {
    if (!eqEnabled || !eqInitialized || !filters[bandIndex]) return;
    const clampedGain = Math.max(-12, Math.min(12, gain));
    filters[bandIndex].gain.setTargetAtTime(clampedGain, audioCtx.currentTime, 0.01);
  }

  function applyEqBands(gains) {
    if (!eqEnabled || !eqInitialized) return;
    if (!Array.isArray(gains)) return;
    gains.forEach((gain, i) => {
      if (filters[i] !== undefined) {
        filters[i].gain.value = gain;
      }
    });
  }

  function applyEqPreset(presetName) {
    const gains = EQ_PRESETS[presetName];
    if (!gains) return;
    applyEqBands(gains);
  }

  async function loadEqSettings() {
    const videoId = getCurrentVideoId();

    chrome.storage.local.get(['eqEnabled', 'eq_global'], (data) => {
      eqEnabled = data.eqEnabled !== false;

      if (videoId) {
        const songKey = `eq_track_${videoId}`;
        chrome.storage.local.get([songKey, 'eq_global'], (result) => {
          if (result[songKey]) {
            applyEqBands(result[songKey].bands);
            currentPresetName = result[songKey].preset || 'Custom';
          } else if (result.eq_global) {
            applyEqBands(result.eq_global.bands);
            currentPresetName = result.eq_global.preset || 'Custom';
          }
        });
      } else if (data.eq_global) {
        applyEqBands(data.eq_global.bands);
        currentPresetName = data.eq_global.preset || 'Custom';
      }
    });
  }

  async function onSongChange(videoId) {
    if (!videoId || videoId === currentVideoId) return;
    currentVideoId = videoId;

    const songKey = `eq_track_${videoId}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get([songKey, 'eq_global'], resolve);
    });

    if (result[songKey]) {
      applyEqBands(result[songKey].bands);
      currentPresetName = result[songKey].preset || 'Custom';
    } else if (result.eq_global) {
      applyEqBands(result.eq_global.bands);
      currentPresetName = result.eq_global.preset || 'Custom';
    }
  }

  function saveSongEQ(videoId, bands, presetName) {
    const songKey = `eq_track_${videoId}`;
    const settings = { preset: presetName || 'Custom', bands };

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const obj = {};
      obj[songKey] = settings;
      chrome.storage.local.set(obj, () => {
      });
    }, 1000);
  }

  function resetSongEQ(videoId) {
    const songKey = `eq_track_${videoId}`;
    chrome.storage.local.remove([songKey], () => {
    });
    applyGlobalEq();
    currentPresetName = 'Custom';
  }

  function applyGlobalEq() {
    chrome.storage.local.get(['eq_global'], (result) => {
      if (result.eq_global) {
        applyEqBands(result.eq_global.bands);
        currentPresetName = result.eq_global.preset || 'Custom';
      } else {
        applyEqBands([0, 0, 0, 0, 0]);
        currentPresetName = 'Flat';
      }
    });
  }

  function saveGlobalEQ(bands, presetName) {
    const settings = { preset: presetName || 'Custom', bands };
    clearTimeout(globalSaveTimeout);
    globalSaveTimeout = setTimeout(() => {
      chrome.storage.local.set({ eq_global: settings }, () => {
      });
    }, 500);
  }

  function getEqState() {
    const gains = filters.map(f => f.gain.value);
    return {
      enabled: eqEnabled,
      initialized: eqInitialized,
      bands: gains,
      preset: currentPresetName,
      videoId: currentVideoId
    };
  }

  async function checkHasCustomEQ(videoId) {
    const cacheKey = `eq_track_${videoId}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get([cacheKey], resolve);
    });
    return !!result[cacheKey];
  }

  function handleEqMessage(message, sendResponse) {
    switch (message.type) {
      case 'init':
        const success = initAudioEngine();
        currentVideoId = getCurrentVideoId();
        sendResponse({ success, state: getEqState() });
        break;

      case 'getState':
        sendResponse({ state: getEqState() });
        break;

      case 'setBand':
        setEqBand(message.band, message.gain);
        const newBands = filters.map(f => f.gain.value);
        const newPreset = detectPreset(newBands);
        currentPresetName = newPreset;
        saveGlobalEQ(newBands, newPreset);
        sendResponse({ success: true, state: getEqState() });
        break;

      case 'applyPreset':
        applyEqPreset(message.preset);
        const presetBands = EQ_PRESETS[message.preset];
        currentPresetName = message.preset;
        saveGlobalEQ(presetBands, message.preset);
        sendResponse({ success: true, state: getEqState() });
        break;

      case 'toggle':
        eqEnabled = message.enabled;
        chrome.storage.local.set({ eqEnabled });
        syncAudioPath();
        sendResponse({ success: true, state: getEqState() });
        break;

      case 'saveSong':
        const bandsToSave = message.bands || filters.map(f => f.gain.value);
        saveSongEQ(message.videoId || currentVideoId, bandsToSave, message.preset);
        sendResponse({ success: true });
        break;

      case 'resetSong':
        resetSongEQ(message.videoId || currentVideoId);
        sendResponse({ success: true });
        break;

      case 'getCurrentVideoId':
        sendResponse({ videoId: getCurrentVideoId() });
        break;

      case 'hasCustomEQ':
        checkHasCustomEQ(message.videoId || currentVideoId).then(hasCustom => {
          sendResponse({ hasCustom });
        });
        return;

      case 'getVideoId':
        sendResponse({ videoId: currentVideoId });
        break;

      case 'flat':
        applyEqBands([0, 0, 0, 0, 0]);
        currentPresetName = 'Flat';
        saveGlobalEQ([0, 0, 0, 0, 0], 'Flat');
        sendResponse({ success: true, state: getEqState() });
        break;

      case 'getCustomPresets':
        getCustomPresets().then(presets => {
          sendResponse({ presets });
        });
        return;

      case 'saveCustomPreset':
        saveCustomPreset(message.name, message.bands).then(id => {
          const videoId = message.videoId || currentVideoId;
          if (message.applyTo === 'global') {
            saveGlobalEQ(message.bands, message.name);
          } else if (message.applyTo === 'song' && videoId) {
            saveSongEQ(videoId, message.bands, message.name);
          }
          // Apply EQ bands to audio after saving
          applyEqBands(message.bands);
          currentPresetName = message.name;
          sendResponse({ success: true, id });
        });
        return;

      case 'renameCustomPreset':
        renameCustomPreset(message.id, message.name).then(result => {
          sendResponse({ success: result });
        });
        return;

      case 'deleteCustomPreset':
        deleteCustomPreset(message.id).then(result => {
          sendResponse({ success: result });
        });
        return;

      case 'applyCustomPreset':
        getCustomPresets().then(presets => {
          const customPreset = presets[message.id];
          if (customPreset) {
            applyEqBands(customPreset.bands);
            currentPresetName = customPreset.name;
            saveGlobalEQ(customPreset.bands, customPreset.name);
          }
          sendResponse({ success: !!customPreset, state: getEqState() });
        });
        return;

      case 'exportPresets':
        chrome.storage.local.get(null, (allData) => {
          const exportData = {
            eq_custom_presets: allData.eq_custom_presets || {},
            eq_global: allData.eq_global,
            eq_enabled: allData.eqEnabled
          };
          sendResponse({ data: exportData });
        });
        return;

      case 'importPresets':
        if (message.data) {
          const custom = message.data.eq_custom_presets || {};
          getCustomPresets().then(existing => {
            const merged = { ...existing, ...custom };
            chrome.storage.local.set({ eq_custom_presets: merged }, () => {
              sendResponse({ success: true });
            });
          });
        } else {
          sendResponse({ success: false });
        }
        return;
    }
  }

  function detectPreset(gains) {
    for (const [name, presetGains] of Object.entries(EQ_PRESETS)) {
      if (JSON.stringify(gains) === JSON.stringify(presetGains)) {
        return name;
      }
    }
    return 'Custom';
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function getCustomPresets() {
    return new Promise(resolve => {
      chrome.storage.local.get(['eq_custom_presets'], (result) => {
        resolve(result.eq_custom_presets || {});
      });
    });
  }

  async function saveCustomPreset(name, bands) {
    const presets = await getCustomPresets();
    const id = generateUUID();
    presets[id] = { name, bands };
    return new Promise(resolve => {
      chrome.storage.local.set({ eq_custom_presets: presets }, () => {
        resolve(id);
      });
    });
  }

  async function renameCustomPreset(id, newName) {
    const presets = await getCustomPresets();
    if (presets[id]) {
      presets[id].name = newName;
      return new Promise(resolve => {
        chrome.storage.local.set({ eq_custom_presets: presets }, () => {
          resolve(true);
        });
      });
    }
    return false;
  }

  async function deleteCustomPreset(id) {
    const presets = await getCustomPresets();
    if (presets[id]) {
      delete presets[id];
      return new Promise(resolve => {
        chrome.storage.local.set({ eq_custom_presets: presets }, () => {
          resolve(true);
        });
      });
    }
    return false;
  }

  function initEqMessageHandler() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'EQ') {
        handleEqMessage(message, sendResponse);
        return true;
      }
      if (message.action === 'GET_SONG_REMAINING') {
        const time = getPlayerTime();
        const duration = getPlayerDuration();
        if (duration && duration > 0 && time !== null) {
          sendResponse({ remainingMs: Math.max(1000, (duration - time) * 1000) });
        } else {
          sendResponse({ remainingMs: null });
        }
        return true;
      }
      if (message.action === 'SET_END_OF_SONG') {
        endOfSongActive = true;
        endOfSongVideoId = getCurrentVideoId();
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'CANCEL_END_OF_SONG') {
        endOfSongActive = false;
        endOfSongVideoId = null;
        sendResponse({ success: true });
        return true;
      }
    });
  }

  let videoObserver = null;
  function initVideoObserver() {
    if (videoObserver) return;

    videoObserver = new MutationObserver(() => {
      if (eqInitialized && !findVideoElement()) {
        eqInitialized = false;
      }
    });

    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  function initSongObserver() {
    if (songObserverInterval) return;

    let lastUrl = window.location.href;

    function checkSongChange() {
      const videoId = getCurrentVideoId();
      if (videoId && videoId !== currentVideoId) {
        onSongChange(videoId);
      }
      if (endOfSongActive && endOfSongVideoId && videoId && videoId !== endOfSongVideoId) {
        endOfSongActive = false;
        endOfSongVideoId = null;
        const btn = document.querySelector('ytmusic-player-bar #play-pause-button button');
        if (btn && btn.getAttribute('aria-label')?.toLowerCase().includes('pause')) {
          btn.click();
        }
      }
    }

    function checkUrlChange() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(checkSongChange, 500);
      }
    }

    songObserverInterval = setInterval(checkUrlChange, 1000);

    document.addEventListener('ytmusic-player-bar', checkSongChange);

    const originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(checkUrlChange, 500);
    };
  }

  visibilityChangeHandler = async () => {
    if (document.visibilityState === 'visible' && audioCtx?.state === 'suspended') {
      await audioCtx.resume();
    }
    if (document.hidden) {
      stopAmbientAnimation();
    } else if (settings.animatedEnabled && ambientImg) {
      startAmbientAnimation();
    }
  };
  document.addEventListener('visibilitychange', visibilityChangeHandler);

  let keyboardShortcutsInitialized = false;
  function initKeyboardShortcuts() {
    if (keyboardShortcutsInitialized) return;
    keyboardShortcutsInitialized = true;
    keydownHandler = (e) => {
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
        if (isFullscreen && isVideoModeV2()) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      }

      // ']' key for sidebar toggle in fullscreen
      if (e.key === ']' && document.body.classList.contains('fullscreen-active')) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener('keydown', keydownHandler);
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
  let previousTabIndex = 0;
  let sidebarWasActive = false;
  let lyricsScrollPosition = 0;
  let lyricsCurrentIndex = -1;
  let isTransitioningFullscreen = false;
  let isVideoReady = true;
  let syncSessionId = 0;
  let pendingLyricsData = null; // Store lyrics for lazy-load retry
  let lyricsRenderInProgress = false; // Debounce flag to prevent multiple Tier 3 retries
  let enhanceNullInFlight = false; // Guard against enhanceLyrics(null) spam from Observer

  // ============================================
  // UNIFIED ALBUM ART & SIDEBAR - Variables
  // ============================================
  let currentSongHasLyrics = false;
  let lyricsState = 'none'; // 'synced', 'plain', 'none'
  let lyricsClickHandler = null;
  let isCrossfading = false;
  let wasOnWatchPage = false;
  let visibilityScrollInterval = null;

  function enableLyricsTabIfDisabled() {
    const tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
    for (const tab of tabs) {
      if (tab.textContent?.trim().toLowerCase() === 'lyrics') {
        if (tab.hasAttribute('disabled')) {
          tab.removeAttribute('disabled');
          tab.removeAttribute('aria-disabled');
          tab.style.pointerEvents = '';
          return true;
        }
        return false;
      }
    }
    return false;
  }

  function isOnLyricsTab() {
    const tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
    for (const tab of tabs) {
      if (tab.getAttribute('aria-selected') === 'true') {
        return tab.textContent?.trim().toLowerCase() === 'lyrics';
      }
    }
    return false;
  }

  function isOnPlayerPage() {
    return !!document.querySelector('ytmusic-player-page');
  }

  // Query ONLY Lyrics tab element by page-type attribute (never Related tab)
  function getLyricsTabElement() {
    const lyricsRenderer = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
    if (!lyricsRenderer) return null;

    const lightResult = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer yt-formatted-string.description');
    if (lightResult) return lightResult;

    // Light DOM query failed — check if shadow DOM is hiding the element
    const shelfRenderer = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer');
    if (shelfRenderer && shelfRenderer.shadowRoot) {
      const shadowResult = shelfRenderer.shadowRoot.querySelector('yt-formatted-string.description');
      if (shadowResult) {
        console.log('[YTM-Ext:Diag] getLyricsTabElement: found lyrics in shelf shadow DOM (not returned, needs .getRootNode().host for closest)');
      }
    }
    if (lyricsRenderer.shadowRoot) {
      const shadowResult = lyricsRenderer.shadowRoot.querySelector('ytmusic-description-shelf-renderer yt-formatted-string.description');
      if (shadowResult) {
        console.log('[YTM-Ext:Diag] getLyricsTabElement: found lyrics in tab shadow DOM (not returned, needs .getRootNode().host for closest)');
      }
    }

    return null;
  }

  // Validate that lyrics container is child of Lyrics tab renderer
  function isContainerInLyricsTab(container) {
    if (!container || !document.body.contains(container)) return false;

    // Check if container is inside a Lyrics tab renderer
    const parentRenderer = container.closest('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
    return !!parentRenderer;
  }

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
    let allPassed = true;

    const url = getAlbumArtUrl();
    if (url && !url.includes('w1200') && !url.includes('s1200')) {
      if (!window.__ytmExtWarnedLowResArtUrl) {
        window.__ytmExtWarnedLowResArtUrl = true;
        console.debug('[YTM-Ext] Album art URL might be low-resolution:', url);
      }
    }

    const testDiv = document.createElement('div');
    testDiv.id = 'ytm-ext-test';
    document.body.appendChild(testDiv);
    const found = document.getElementById('ytm-ext-test');
    if (found) {
      found.remove();
    } else {
      console.error('❌ CRITICAL: Cannot append elements to body!');
      allPassed = false;
    }

    document.body.classList.add('ytm-ext-test-class');
    if (document.body.classList.contains('ytm-ext-test-class')) {
      document.body.classList.remove('ytm-ext-test-class');
    } else {
      console.error('❌ CRITICAL: CSS class manipulation failed!');
      allPassed = false;
    }

    try {
      localStorage.setItem('ytm-ext-test', 'test');
      const value = localStorage.getItem('ytm-ext-test');
      if (value === 'test') {
        localStorage.removeItem('ytm-ext-test');
      } else {
        console.error('❌ localStorage read/write mismatch');
        allPassed = false;
      }
    } catch (e) {
      console.error('❌ localStorage error:', e);
      allPassed = false;
    }

    if (!allPassed) {
      console.error('❌ Some pre-flight checks FAILED - features may not work!');
    }
    return allPassed;
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
    const subtitle = document.querySelector('.content-info-wrapper .subtitle');
    if (subtitle) {
      // Get the full text (e.g., "Artist A & Artist B • Album • 2024")
      const text = subtitle.textContent.trim();
      // Split by the middle dot (•) and take the first part (the artists)
      return text.split('•')[0].trim();
    }

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

  // Helper: Try to click Lyrics tab button to force render lazy-loaded content
  function clickLyricsTabToRender() {
    const tabButtons = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
    let lyricsTabButton = null;
    
    // Find Lyrics tab button
    for (const tab of tabButtons) {
      if (tab.textContent?.trim().toLowerCase() === 'lyrics') {
        lyricsTabButton = tab;
        break;
      }
    }
    
    if (!lyricsTabButton) {
      return false;
    }
    
    // Enable if disabled
    if (lyricsTabButton.hasAttribute('disabled')) {
      lyricsTabButton.removeAttribute('disabled');
      lyricsTabButton.removeAttribute('aria-disabled');
      lyricsTabButton.style.pointerEvents = '';
    }
    
    // Click it
    lyricsTabButton.click();
    return true;
  }

  // Helper: Create fallback container in main panel
  function createFallbackContainer() {
    
    // Try various parent selectors
    const selectors = [
      '#music-detail-page',
      '#player-page',
      'ytmusic-player-page',
      '#main-panel'
    ];
    
    let parent = null;
    for (const sel of selectors) {
      parent = document.querySelector(sel);
      if (parent) {
        break;
      }
    }
    
    if (!parent) {
      console.error('[YTM-Ext:Lyrics] Tier 3 FAIL: No parent found');
      return null;
    }
    
    const container = document.createElement('div');
    container.id = 'ytm-ext-synced-lyrics';
    container.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 90% !important;
      max-width: 600px !important;
      max-height: 70vh !important;
      overflow-y: auto !important;
      background: rgba(0,0,0,0.85) !important;
      padding: 20px !important;
      color: #fff !important;
      font-size: 28px !important;
      line-height: 2.2 !important;
      z-index: 9999 !important;
      border-radius: 12px !important;
    `;
    document.body.appendChild(container);
    return container;
  }

  function renderSyncedLyrics(originalElement, lyrics) {
    // Check if container already exists
    let syncedContainer = document.getElementById('ytm-ext-synced-lyrics');

    // NEW: If container exists but is in wrong tab, remove it
    if (syncedContainer && !isContainerInLyricsTab(syncedContainer)) {
      syncedContainer.remove();
      syncedContainer = null; // Force recreation
    }

    // CRITICAL: Only render if on Lyrics tab or if we have an existing container to update
    // This prevents rendering to Related/Up Next tabs during transitions
    if (!syncedContainer && !isOnLyricsTab()) {
      return;
    }

    // TIER 1: originalElement provided - use its shelf renderer
    let shelfRenderer = null;
    let targetParent = null;
    
    if (originalElement) {
      shelfRenderer = originalElement.closest('ytmusic-description-shelf-renderer');
      if (shelfRenderer) {
        // Verify shelf is inside Lyrics tab, not Up Next or Related
        const lyricsTabRenderer = shelfRenderer.closest('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
        if (lyricsTabRenderer) {
          targetParent = shelfRenderer;
        }
      }
    }
    
    // TIER 2: Find Lyrics tab renderer by page-type
    if (!targetParent) {
      const lyricsRenderer = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
      if (lyricsRenderer) {
        const shelf = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer');
        if (shelf) {
          shelfRenderer = shelf;
          targetParent = shelf;
        }
      }
    }
    
    // TIER 3: Tab renderer not ready — store pending lyrics and wait for MutationObserver
    if (!targetParent && !syncedContainer && !lyricsRenderInProgress) {
      lyricsRenderInProgress = true;
      pendingLyricsData = lyrics;
      if (!isOnLyricsTab()) {
        // Not currently on Lyrics tab — click to navigate there
        const clicked = clickLyricsTabToRender();
        if (clicked) {
          return; // Let MutationObserver detect when tab appears
        } else {
          lyricsRenderInProgress = false;
          pendingLyricsData = null;
        }
      } else {
        // Already on Lyrics tab — renderer not ready yet, wait for MutationObserver
        return;
      }
    }
    
    // TIER 4: All tiers failed — log and return (no floating overlay)
    if (!targetParent && !syncedContainer) {
      console.error('[YTM-Ext:Lyrics] ALL TIERS FAILED');
      lyricsRenderInProgress = false;
      return;
    }

    // Create container if needed
    if (!syncedContainer && targetParent) {
      syncedContainer = document.createElement('div');
      syncedContainer.id = 'ytm-ext-synced-lyrics';

      if (!shelfRenderer && targetParent.tagName?.toLowerCase() === 'ytmusic-tab-renderer') {
        // No shelf (YTM has no lyrics) — insert before message renderer
        const messageRenderer = targetParent.querySelector('ytmusic-message-renderer');
        if (messageRenderer) {
          targetParent.insertBefore(syncedContainer, messageRenderer);
        } else {
          targetParent.appendChild(syncedContainer);
        }
      } else {
        // Shelf exists — append inside shelf (identical to main)
        targetParent.appendChild(syncedContainer);
      }
    }

    // Hide original content
    if (shelfRenderer) {
      // Case A: Shelf exists — hide all shelf children except our container
      Array.from(shelfRenderer.children).forEach(child => {
        if (child.id !== 'ytm-ext-synced-lyrics') {
          child.style.display = 'none';
        }
      });
    } else if (targetParent?.tagName?.toLowerCase() === 'ytmusic-tab-renderer') {
      // Case B: No shelf — hide only the message renderer, keep queue visible
      const messageRenderer = targetParent.querySelector('ytmusic-message-renderer');
      if (messageRenderer) {
        messageRenderer.style.display = 'none';
      }
    }

    // Apple Music style container
    syncedContainer.style.cssText = 'display:block !important; width:100%; color:#fff; font-size:28px; line-height:2.2;';

    syncedContainer.innerHTML = lyrics
      .map((line, i) => `<div class="synced-line" data-time="${line.time}" data-index="${i}">${escapeHtml(line.text)}</div>`)
      .join('');

    // Start or restart sync — every render path goes through here so sync always fires
    const renderSessionId = syncSessionId;
    requestAnimationFrame(() => startSync(lyrics, renderSessionId));

    // Clear pending lyrics since we rendered successfully
    if (pendingLyricsData) {
      pendingLyricsData = null;
    }

    // Clear render in progress flag
    if (lyricsRenderInProgress) {
      lyricsRenderInProgress = false;
    }

    // Add click-to-seek (remove old handler to prevent accumulation)
    if (lyricsClickHandler) {
      syncedContainer.removeEventListener('click', lyricsClickHandler);
    }
    lyricsClickHandler = function(e) {
      if (e.target.classList.contains('synced-line')) {
        e.preventDefault();
        e.stopPropagation();
        if (!isVideoReady) {
          return;
        }
        const lyricTime = parseFloat(e.target.dataset.time);
        seekPlayer(lyricTime);
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
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        return;
      }

      const time = getPlayerTime();
      handlerCallCount++;

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
  }

  async function enhanceLyrics(element) {
    // Don't inject lyrics in video mode or non-player pages
    if (isVideoModeV2()) { enhanceNullInFlight = false; return; }
    if (!isOnPlayerPage()) return;

    // If no element (YTM has no lyrics), we'll still fetch and render synced lyrics
    if (element) {
      element.dataset.synced = 'processing';
    }

    const title = getSongTitle();
    const artist = getArtistName();

    if (!title) {
      if (element) {
        element.dataset.synced = 'failed';
      }
      enhanceNullInFlight = false;
      return;
    }

    // Capture session ID to detect stale async work
    const mySessionId = syncSessionId;

    try {
      // Get duration from player bridge (correct per-song value, not MSE cumulative)
      let duration = getPlayerDuration();

      // Request synced lyrics from background
      const syncedLyrics = await chrome.runtime.sendMessage({
        action: 'FETCH_LYRICS',
        title,
        artist,
        duration
      });

      // Abort if song changed while fetching
      if (syncSessionId !== mySessionId) {
        enhanceNullInFlight = false;
        return;
      }


      if (syncedLyrics) {
        const parsed = parseLRC(syncedLyrics);
        if (parsed.length > 0) {
          // Store in pendingLyricsData for lazy-load retry
          pendingLyricsData = parsed;
          // Re-check for element — async work may have taken long enough for shelf to render
          const freshEl = element || getLyricsTabElement();
          renderSyncedLyrics(freshEl, parsed);
          if (freshEl) freshEl.dataset.synced = 'true';
          lyricsState = 'synced';
          currentSongHasLyrics = true;
          enhanceNullInFlight = false;
          return;
        }
      }
    } catch (error) {
      console.error('[YTM-Ext] Lyrics sync error:', error);
    }

    // Keep original lyrics if sync fails - check if plain lyrics exist
    if (element) {
      element.dataset.synced = 'failed';
    }

    // Check if plain lyrics exist (only if element exists)
    const plainLyricsText = element ? (element.textContent?.trim() || '') : '';
    if (plainLyricsText.length > 50) {
      lyricsState = 'plain';
      currentSongHasLyrics = true;
    } else {
      lyricsState = 'none';
      currentSongHasLyrics = false;
    }

    // If in fullscreen and no synced lyrics found, collapse sidebar
    if (isFullscreen && lyricsState !== 'synced') {
      document.body.classList.add('sidebar-collapsed');
    }

    // Re-enable click-to-seek even without synced lyrics
    if (syncSessionId === mySessionId) {
      isVideoReady = true;
    }
    enhanceNullInFlight = false;
  }

  function checkSongChange() {
    const newTitle = getSongTitle();
    if (newTitle && newTitle !== currentSongTitle) {
      currentSongTitle = newTitle;
      lyricsCurrentIndex = -1; // Reset current index for new song
      isVideoReady = false;
      syncSessionId++;
      enhanceNullInFlight = false;
      pendingLyricsData = null;
      lyricsRenderInProgress = false;

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
      originalLyricsParent = null;

      // Clear dataset.synced ONLY from Lyrics tab elements when song changes
      // This ensures the new song's lyrics element doesn't have stale dataset.synced
      const lyricsTab = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
      if (lyricsTab) {
        const lyricsTabElements = lyricsTab.querySelectorAll('ytmusic-description-shelf-renderer yt-formatted-string.description');
        lyricsTabElements.forEach(el => {
          if (el.dataset.synced) {
            delete el.dataset.synced;
          }
        });
      }

      // Preload album art for fullscreen (instant update on song change)
      const newArtUrl = getAlbumArtUrl();
      preloadFullscreenArt(newArtUrl);

      // Update fullscreen album art if in fullscreen
      if (isFullscreen) {
        updateFullscreenAlbumArt();
      }

      // Update unified album art
      updateUnifiedAlbumArt();

      // Reset synced state on lyrics element (skip in video mode or non-Lyrics tab)
      if (isVideoModeV2()) return;
      if (isOnLyricsTab()) {
        const lyricsElement = getLyricsTabElement();
        const containerExists = document.getElementById('ytm-ext-synced-lyrics');

        if (lyricsElement && !lyricsElement.dataset.synced) {
          // YTM has native lyrics - enhance them
          delete lyricsElement.dataset.synced;
          lyricsElement.style.cssText = '';
          enhanceLyrics(lyricsElement);

          // If in fullscreen, move lyrics after enhanceLyrics completes
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
        } else if (!containerExists && !lyricsElement && pendingLyricsData) {
          currentSongTitle = getSongTitle();
          renderSyncedLyrics(null, pendingLyricsData);
        } else if (containerExists && pendingLyricsData) {
          // Container exists but we have new pending lyrics - update content
          renderSyncedLyrics(null, pendingLyricsData);
          pendingLyricsData = null;
        } else if (!containerExists && !lyricsElement && !enhanceNullInFlight) {
          // YTM has NO lyrics - trigger fetch
          enhanceNullInFlight = true;
          currentSongTitle = getSongTitle();
          setTimeout(() => {
            enhanceLyrics(null);
          }, 100);
        }
      }
    }
  }

  function initLyricsSync() {
    if (lyricsObserver) return;

    // Enable disabled Lyrics tab on user click and render synced lyrics
    lyricsTabClickHandler = (e) => {
      if (isVideoModeV2()) return;
      const tab = e.target.closest('tp-yt-paper-tab.tab-header.ytmusic-player-page');
      if (!tab) return;
      
      // Enable if disabled
      enableLyricsTabIfDisabled();
      
      // Check if user clicked Lyrics tab (by text, not index)
      if (tab.textContent?.trim().toLowerCase() === 'lyrics') {
        const lyricsElement = getLyricsTabElement();
        const containerExists = document.getElementById('ytm-ext-synced-lyrics');
        
        if (!lyricsElement && !containerExists) {
          // YTM has no lyrics - render our synced lyrics
          currentSongTitle = getSongTitle();
          enhanceNullInFlight = true;
          enhanceLyrics(null);
        }
      }
    };
    document.addEventListener('click', lyricsTabClickHandler, { passive: true });

    // Shared state for video→song transition recovery
    let wasInVideoForFix = false;
    let lyricsTabFixApplied = false;
    let switchedTabForVideoMode = false;

    // Watch for lyrics panel to appear AND song changes
    lyricsObserver = new MutationObserver(() => {
      checkSongChange();

      if (!isOnPlayerPage()) return;

      if (isVideoModeV2()) {
        // Clear sync in video mode (prevents stale state accumulation)
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        // Signal to interval that we've been in video mode
        lyricsTabFixApplied = false;
        wasInVideoForFix = true;

        // Switch from Lyrics to Up Next on video entry (once per transition)
        if (!switchedTabForVideoMode) {
          const tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
          for (const tab of tabs) {
            if (tab.getAttribute('aria-selected') === 'true' && tab.textContent?.trim() === 'Lyrics') {
              for (const t of tabs) {
                if (t.textContent?.trim() === 'Up next') {
                  t.click();
                  break;
                }
              }
              break;
            }
          }
          switchedTabForVideoMode = true;
        }

        return;
      }

      // Reset video tab switch flag when back in song mode
      switchedTabForVideoMode = false;

      // Only attempt lyrics injection when on Lyrics tab
      if (isOnLyricsTab()) {
        const lyricsElement = getLyricsTabElement();
        const containerExists = document.getElementById('ytm-ext-synced-lyrics');

        if (lyricsElement && !lyricsElement.dataset.synced) {
          // YTM has native lyrics - enhance them
          currentSongTitle = getSongTitle();
          enhanceLyrics(lyricsElement);
        } else if (!containerExists && lyricsElement && lyricsElement.dataset.synced === 'true') {
          // Container was removed (by tab switch) but dataset.synced is still set
          // This happens when user switches away from Lyrics tab and returns
          // Clear flag and re-enhance to restore lyrics
          delete lyricsElement.dataset.synced;
          lyricsElement.style.cssText = '';
          currentSongTitle = getSongTitle();
          enhanceLyrics(lyricsElement);
        } else if (!containerExists && !lyricsElement && pendingLyricsData) {
          currentSongTitle = getSongTitle();
          renderSyncedLyrics(null, pendingLyricsData);
        } else if (containerExists && pendingLyricsData) {
          // Container exists but we have new pending lyrics - update content
          renderSyncedLyrics(null, pendingLyricsData);
          pendingLyricsData = null;
        } else if (!containerExists && !lyricsElement && !enhanceNullInFlight) {
          // No lyrics anywhere - trigger fetch
          enhanceNullInFlight = true;
          currentSongTitle = getSongTitle();
          enhanceLyrics(null);
        }
      } else {
        // Only clear pendingLyricsData when user has explicitly navigated to another tab.
        // During transient states (tab-switch animation, no tab selected), preserve the data
        // so MutationObserver Branch 3 can render it once the Lyrics tab renderer loads.
        const hasOtherTabSelected = !!document.querySelector(
          'tp-yt-paper-tab.tab-header.ytmusic-player-page[aria-selected="true"]'
        );
        if (hasOtherTabSelected && pendingLyricsData) {
          pendingLyricsData = null;
        }

        // Remove container if it exists in wrong tab (YTM moves shelf elements between tabs)
        const containerExists = document.getElementById('ytm-ext-synced-lyrics');
        if (containerExists && !isContainerInLyricsTab(containerExists)) {
          containerExists.remove();
        }
      }
    });

    lyricsObserver.observe(document.body, { childList: true, subtree: true });

    // Video→song transition recovery. Handles:
    // 1. YTM bug: Lyrics tab stays disabled after video→song toggle
    // 2. Same-song sync recovery: resets lyrics state so MutationObserver re-initializes
    // Runs every 2s, only acts ONCE per transition (flag-guarded).
    lyricsTransitionInterval = setInterval(() => {
      const inVideo = isVideoModeV2();

      if (inVideo) {
        wasInVideoForFix = true;
        lyricsTabFixApplied = false;
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        return;
      }

      if (lyricsTabFixApplied) return;

      // Re-enable Lyrics tab if YTM left it disabled (YTM bug workaround)
      const tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
      let lyricsTab = null;
      for (const tab of tabs) {
        if (tab.textContent?.trim() === 'Lyrics') {
          lyricsTab = tab;
          break;
        }
      }

      if (lyricsTab && lyricsTab.hasAttribute('disabled')) {
        lyricsTab.removeAttribute('disabled');
        lyricsTab.removeAttribute('aria-disabled');
        lyricsTab.style.pointerEvents = '';
        lyricsTab.click();
      }

      // Reset lyrics sync state after video→song transition (only if on Lyrics tab)
      if (wasInVideoForFix && isOnLyricsTab()) {
        syncSessionId++;
        const lyricsElement = getLyricsTabElement();
        if (lyricsElement) {
          delete lyricsElement.dataset.synced;
        }
        const container = document.getElementById('ytm-ext-synced-lyrics');
        if (container) container.remove();
        wasInVideoForFix = false;
      }

      switchedTabForVideoMode = false;
      lyricsTabFixApplied = true;
    }, 2000);

    // Also check immediately (skip in video mode, only on Lyrics tab)
    if (!isVideoModeV2() && isOnLyricsTab()) {
      const lyricsElement = getLyricsTabElement();
      const containerExists = document.getElementById('ytm-ext-synced-lyrics');

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
      } else if (!containerExists && !lyricsElement && pendingLyricsData) {
        currentSongTitle = getSongTitle();
        renderSyncedLyrics(null, pendingLyricsData);
      } else if (containerExists && pendingLyricsData) {
        // Container exists but we have new pending lyrics - update content
        renderSyncedLyrics(null, pendingLyricsData);
        pendingLyricsData = null;
      } else if (!containerExists && !lyricsElement && !enhanceNullInFlight) {
        enhanceNullInFlight = true;
        currentSongTitle = getSongTitle();
        enhanceLyrics(null);
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

    // Save sidebar state
    sidebarWasActive = !document.body.classList.contains('sidebar-collapsed');

    // Save current active tab INDEX
    let tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('aria-selected') === 'true') {
        previousTabIndex = i;
        break;
      }
    }

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

    // If sidebar was active, auto-switch to Lyrics tab (index 1)
    if (sidebarWasActive && previousTabIndex !== 1) {
      tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
      if (tabs[1]) {
        enableLyricsTabIfDisabled();
        tabs[1].click();
      }
    }

    document.body.classList.add('fullscreen-active');

    // Hide player bar via inline styles (beats YouTube's CSS overrides)
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      playerBar.style.setProperty('opacity', '0', 'important');
      playerBar.style.setProperty('pointer-events', 'none', 'important');
      playerBar.style.setProperty('transform', 'translateY(100%)', 'important');
      playerBar.style.setProperty('transition', 'opacity 0.3s ease, transform 0.3s ease', 'important');
      if (fsBarObserver) fsBarObserver.disconnect();
      fsBarObserver = new MutationObserver(() => {
        if (document.body.classList.contains('fs-controls-visible')) return;
        playerBar.style.setProperty('opacity', '0', 'important');
        playerBar.style.setProperty('pointer-events', 'none', 'important');
        playerBar.style.setProperty('transform', 'translateY(100%)', 'important');
      });
      fsBarObserver.observe(playerBar, { attributes: true, attributeFilter: ['style'] });
    }

    // Grace period: don't show controls on immediate mousemove
    fsJustEntered = true;
    setTimeout(() => { fsJustEntered = false; }, 1000);

    // Ensure song info div exists in unified art container
    ensureSongInfoExists();

    // Auto-collapse based on previous sidebar state
    if (!sidebarWasActive) {
      document.body.classList.add('sidebar-collapsed');
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
    document.body.classList.remove('fs-controls-visible');
    clearTimeout(fsControlsTimeout);
    fsControlsTimeout = null;
    fsJustEntered = false;

    // Disconnect MutationObserver and clear inline styles on player bar
    if (fsBarObserver) { fsBarObserver.disconnect(); fsBarObserver = null; }
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      playerBar.style.removeProperty('opacity');
      playerBar.style.removeProperty('pointer-events');
      playerBar.style.removeProperty('transform');
      playerBar.style.removeProperty('transition');
    }

    // Restore sidebar to original state
    const isCurrentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    if (sidebarWasActive && isCurrentlyCollapsed) {
      document.body.classList.remove('sidebar-collapsed');
    } else if (!sidebarWasActive && !isCurrentlyCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    }

    // Restore exact tab by index
    const tabs = document.querySelectorAll('tp-yt-paper-tab.tab-header.ytmusic-player-page');
    if (tabs[previousTabIndex] && tabs[previousTabIndex].getAttribute('aria-selected') !== 'true') {
      tabs[previousTabIndex].click();
    }

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
    if (!img || !artUrl) return;

    // Use preloaded image if available and complete (instant update)
    if (preloadedFullscreenImg && preloadedFullscreenImg.complete && preloadedFullscreenImg.src === artUrl) {
      img.src = artUrl;
    } else {
      // Fallback: set src directly (browser loads it)
      img.src = artUrl;
    }

    // Update song info
    const titleEl = document.querySelector('.unified-song-title');
    const artistEl = document.querySelector('.unified-song-artist');
    if (titleEl) titleEl.textContent = getSongTitle() || '';
    if (artistEl) artistEl.textContent = getArtistName() || '';
  }

  function preloadFullscreenArt(artUrl) {
    if (!artUrl) return;
    preloadedFullscreenImg = new Image();
    preloadedFullscreenImg.onerror = () => { preloadedFullscreenImg = null; };
    preloadedFullscreenImg.src = artUrl;
  }

  let fullscreenInitialized = false;
  function initFullscreen() {
    if (fullscreenInitialized) return;
    fullscreenInitialized = true;
    fullscreenChangeHandler = () => {
      isFullscreen = !!document.fullscreenElement;
      const videoCheck = isVideoModeV2();
      if (isFullscreen) {
        if (!videoCheck) {
          createFullscreenUI();
        } else {
          document.body.classList.add('video-fullscreen');
        }
      } else {
        document.body.classList.remove('video-fullscreen');
        removeFullscreenUI();
      }
    };
    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
  }

  // ============================================
  // FULLSCREEN - Auto-Hide Controls
  // ============================================

  let fsControlsTimeout = null;
  let fsJustEntered = false;
  let fsBarObserver = null;

  function ensureSongInfoExists() {
    const container = document.getElementById('ytm-ext-unified-art');
    if (!container) return;
    const wrapper = document.getElementById('ytm-ext-art-wrapper');
    if (!wrapper) return;
    if (wrapper.querySelector('.unified-song-info')) return;
    const songInfo = document.createElement('div');
    songInfo.className = 'unified-song-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'unified-song-title';
    titleEl.textContent = getSongTitle() || '';
    const artistEl = document.createElement('div');
    artistEl.className = 'unified-song-artist';
    artistEl.textContent = getArtistName() || '';
    songInfo.appendChild(titleEl);
    songInfo.appendChild(artistEl);
    wrapper.appendChild(songInfo);
  }

  function initFullscreenControls() {
    mousemoveHandler = () => {
      if (!document.body.classList.contains('fullscreen-active')) return;
      if (fsJustEntered) return;
      document.body.classList.add('fs-controls-visible');
      clearTimeout(fsControlsTimeout);
      const playerBar = document.querySelector('ytmusic-player-bar');
      if (playerBar) {
        playerBar.style.setProperty('opacity', '1', 'important');
        playerBar.style.setProperty('pointer-events', 'auto', 'important');
        playerBar.style.setProperty('transform', 'translateY(0)', 'important');
      }
      fsControlsTimeout = setTimeout(() => {
        document.body.classList.remove('fs-controls-visible');
        if (document.body.classList.contains('fullscreen-active')) {
          const pb = document.querySelector('ytmusic-player-bar');
          if (pb) {
            pb.style.setProperty('opacity', '0', 'important');
            pb.style.setProperty('pointer-events', 'none', 'important');
            pb.style.setProperty('transform', 'translateY(100%)', 'important');
          }
        }
      }, 3000);
    };
    document.addEventListener('mousemove', mousemoveHandler);
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

    if (document.getElementById('ytm-ext-unified-art')) {
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

    const songInfo = document.createElement('div');
    songInfo.className = 'unified-song-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'unified-song-title';
    titleEl.textContent = getSongTitle() || '';
    const artistEl = document.createElement('div');
    artistEl.className = 'unified-song-artist';
    artistEl.textContent = getArtistName() || '';
    songInfo.appendChild(titleEl);
    songInfo.appendChild(artistEl);
    wrapper.appendChild(songInfo);

    container.appendChild(wrapper);
    document.body.appendChild(container);


    updateUnifiedAlbumArt();
  }

  function positionToggleBetweenHeaderAndVideo() {
    const toggle = document.querySelector('#av-id');
    if (!toggle) return;

    if (!document.body.classList.contains('video-mode')) {
      toggle.style.removeProperty('top');
      return;
    }

    // Log ALL candidate elements in one pass
    const candidates = ['#nav-bar-background', '#song-image', '#main-panel', '#song-media-window', 'ytmusic-player video', 'ytmusic-player-page #main-panel'];
    const rects = {};
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        rects[sel] = { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
      } else {
        rects[sel] = null;
      }
    }

    const header = document.querySelector('#nav-bar-background');
    const video = document.querySelector('#song-image');
    if (!header || !video) return;

    const headerBottom = header.getBoundingClientRect().bottom;
    const videoTop = video.getBoundingClientRect().top;
    if (videoTop <= headerBottom) return;

    const toggleHeight = toggle.offsetHeight || 36;
    const midpoint = (headerBottom + videoTop) / 2;
    const finalTop = midpoint - toggleHeight / 2;
    toggle.style.setProperty('top', finalTop + 'px', 'important');
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

    const wrapper = document.getElementById('ytm-ext-art-wrapper');
    const playerButtons = document.querySelector('.top-row-buttons');

    // Track buttons' native parent (updates if YTM recreates the element)
    if (playerButtons && wrapper && !wrapper.contains(playerButtons)) {
      originalButtonsParent = playerButtons.parentElement;
    }

    // Check video mode BEFORE moving buttons
    const isVideo = isVideoModeV2();
    if (isVideo) {
      container.classList.add('hidden');
      document.body.classList.add('video-mode');
      // Return buttons to native parent so they're not hidden with container
      if (playerButtons && originalButtonsParent && originalButtonsParent.isConnected && wrapper.contains(playerButtons)) {
        originalButtonsParent.appendChild(playerButtons);
      }
      positionToggleBetweenHeaderAndVideo();
      return;
    }
    document.body.classList.remove('video-mode');

    // Album art mode: move buttons into wrapper for hover reveal
    if (playerButtons && wrapper && !wrapper.contains(playerButtons)) {
      wrapper.appendChild(playerButtons);
    }

    const url = getAlbumArtUrl();
    if (!url) {
      container.classList.add('hidden');
      return;
    }

    const rawUrl = getAlbumArtUrlRaw();
    container.classList.remove('hidden');

    // Update song info text
    const titleEl = document.querySelector('.unified-song-title');
    const artistEl = document.querySelector('.unified-song-artist');
    if (titleEl) titleEl.textContent = getSongTitle() || '';
    if (artistEl) artistEl.textContent = getArtistName() || '';

    // Skip if same URL or crossfade already in progress
    if (img.src === url) {
      return;
    }
    if (isCrossfading) return;

    isCrossfading = true;
    img.classList.add('fading-out');

    setTimeout(() => {
      const nextUrl = url;
      const nextRawUrl = rawUrl && rawUrl !== nextUrl ? rawUrl : null;
      img.dataset.fallbackTried = '';

      const setSrc = (src) => {
        img.src = src;
        img.dataset.lastRequestedSrc = src;
      };

      img.onload = () => {
        img.classList.remove('fading-out');
        isCrossfading = false;
      };
      img.onerror = (e) => {
        if (!img.dataset.fallbackTried && nextRawUrl) {
          img.dataset.fallbackTried = '1';
          setSrc(nextRawUrl);
          return;
        }
        console.error('[YTM-Ext:UnifiedArt] Image failed to load:', img.dataset.lastRequestedSrc || img.src, e);
        img.classList.remove('fading-out');
        isCrossfading = false;
      };
      setSrc(nextUrl);
    }, 300);
  }

  // ============================================
  // SIDEBAR TOGGLE
  // ============================================

  function createSidebarToggle() {

    if (document.getElementById('ytm-ext-sidebar-toggle')) {
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'ytm-ext-sidebar-toggle';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    document.body.appendChild(btn);


    const collapsed = localStorage.getItem('ytm-ext-sidebar-collapsed') === 'true';

    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      // Force YouTube's layout to recalculate after restoring saved state
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }

    btn.addEventListener('click', toggleSidebar);
  }

  function toggleSidebar() {

    const wasCollapsed = document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');


    localStorage.setItem('ytm-ext-sidebar-collapsed', isCollapsed);

    // Force YouTube's layout to recalculate (fixes video staying left-aligned)
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });

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
  // AMBIENT CANVAS ANIMATION
  // ============================================

  function startAmbientAnimation() {
    if (!ambientCanvas || !ambientImg) return;
    cancelAnimationFrame(ambientAnimFrame);
    ambientCanvas.width = Math.floor(window.innerWidth / 2);
    ambientCanvas.height = Math.floor(window.innerHeight / 2);
    ambientLastFrame = 0;
    applyAmbientFilters();
    ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
  }

  function stopAmbientAnimation() {
    cancelAnimationFrame(ambientAnimFrame);
    ambientAnimFrame = null;
  }

  function drawAmbientFrame(timestamp) {
    if (!ambientCanvas || !ambientImg || !settings.animatedEnabled) return;
    if (timestamp - ambientLastFrame < 66) {
      ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
      return;
    }
    ambientLastFrame = timestamp;
    const w = ambientCanvas.width, h = ambientCanvas.height;
    const cx = w / 2, cy = h / 2;
    const t = timestamp / 1000;
    const min = Math.min(w, h);
    const ctx = ambientCanvas.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    if (!ambientPhases) {
      ambientPhases = [0, 1, 2, 3].map(() => Math.random() * Math.PI * 2);
    }

    const lum = ambientImageLuminance || 0.5;
    const isDark = lum < 0.20;
    const isLight = lum > 0.65;

    let overlayAlpha;
    if (isDark) overlayAlpha = 0.08;
    else if (isLight) overlayAlpha = 0.42;
    else overlayAlpha = 0.10 + (lum - 0.20) * 0.55;

    const alphas = isDark ? [0.95, 0.80, 0.68, 0.55]
                 : isLight ? [0.48, 0.33, 0.23, 0.15]
                 : [0.88, 0.70, 0.55, 0.40];

    const layers = [
      { scale: 1.50, rotPeriod: 70, orbitR: min * 0.10, orbitPeriod: 110, phase: ambientPhases[0], alpha: alphas[0] },
      { scale: 1.15, rotPeriod: 55, orbitR: min * 0.18, orbitPeriod: 90,  phase: ambientPhases[1], alpha: alphas[1] },
      { scale: 0.80, rotPeriod: 40, orbitR: min * 0.24, orbitPeriod: 70,  phase: ambientPhases[2], alpha: alphas[2] },
      { scale: 0.45, rotPeriod: 28, orbitR: min * 0.28, orbitPeriod: 50,  phase: ambientPhases[3], alpha: alphas[3] },
    ];

    for (const layer of layers) {
      const lw = w * layer.scale, lh = h * layer.scale;
      const angle = (t / layer.rotPeriod) * Math.PI * 2 + layer.phase;
      const ox = layer.orbitR * Math.cos((t / layer.orbitPeriod) * Math.PI * 2 + layer.phase);
      const oy = layer.orbitR * Math.sin((t / layer.orbitPeriod) * Math.PI * 2 + layer.phase * 1.3);
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(angle);
      ctx.drawImage(ambientImg, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
    }

    ctx.fillStyle = `rgba(5,5,5,${overlayAlpha})`;
    ctx.fillRect(0, 0, w, h);

    ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
  }

  // ============================================
  // CLEANUP & DESTROY
  // ============================================

  function destroyExtension() {
    stopAmbientAnimation();

    // Clear all intervals
    if (mainUpdateInterval) { clearInterval(mainUpdateInterval); mainUpdateInterval = null; }
    if (miniPlayerAutoCloseInterval) { clearInterval(miniPlayerAutoCloseInterval); miniPlayerAutoCloseInterval = null; }
    if (visibilityScrollInterval) { clearInterval(visibilityScrollInterval); visibilityScrollInterval = null; }
    if (songObserverInterval) { clearInterval(songObserverInterval); songObserverInterval = null; }
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    if (pipSyncInterval) { clearInterval(pipSyncInterval); pipSyncInterval = null; }
    if (lyricsTransitionInterval) { clearInterval(lyricsTransitionInterval); lyricsTransitionInterval = null; }

    // Clear timeouts
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    if (globalSaveTimeout) { clearTimeout(globalSaveTimeout); globalSaveTimeout = null; }
    if (fsControlsTimeout) { clearTimeout(fsControlsTimeout); fsControlsTimeout = null; }
    if (window.ambientUpdateTimeout) { clearTimeout(window.ambientUpdateTimeout); window.ambientUpdateTimeout = null; }

    // Disconnect all observers
    if (observer) { observer.disconnect(); observer = null; }
    if (urlObserver) { urlObserver.disconnect(); urlObserver = null; }
    if (lyricsObserver) { lyricsObserver.disconnect(); lyricsObserver = null; }
    if (videoObserver) { videoObserver.disconnect(); videoObserver = null; }
    if (fsBarObserver) { fsBarObserver.disconnect(); fsBarObserver = null; }

    // Remove event listeners
    if (storageChangeHandler && typeof chrome !== 'undefined' && chrome?.storage?.onChanged) { chrome.storage.onChanged.removeListener(storageChangeHandler); storageChangeHandler = null; }
    if (urlChangeHandler) { document.removeEventListener('ytm-ext-url-change', urlChangeHandler); urlChangeHandler = null; }
    if (visibilityChangeHandler) { document.removeEventListener('visibilitychange', visibilityChangeHandler); visibilityChangeHandler = null; }
    if (keydownHandler) { document.removeEventListener('keydown', keydownHandler); keydownHandler = null; }
    if (fullscreenChangeHandler) { document.removeEventListener('fullscreenchange', fullscreenChangeHandler); fullscreenChangeHandler = null; }
    if (mousemoveHandler) { document.removeEventListener('mousemove', mousemoveHandler); mousemoveHandler = null; }
    if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
    if (lyricsTabClickHandler) { document.removeEventListener('click', lyricsTabClickHandler); lyricsTabClickHandler = null; }

    // Close PiP if open
    closePipWindow();

    // Remove created elements
    const elementsToRemove = [
      'yt-music-ambient-bg',
      'ytm-ext-unified-art',
      'ytm-ext-sidebar-toggle',
      'ytm-ext-synced-lyrics',
      'ytm-ext-fullscreen',
      'yt-music-open-yt',
      'ytm-ext-pip-btn'
    ];
    elementsToRemove.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    // Remove body classes
    document.body.classList.remove(
      'ambient-active', 'ytm-ext-active', 'ytm-ext-settled', 'layout-shift-up', 'layout-reduced-size',
      'sidebar-collapsed', 'fullscreen-active', 'video-mode', 'video-fullscreen',
      'fs-controls-visible'
    );

    window.__ytmExtLoaded = false;
  }

  function init() {

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
    initFullscreenControls();
    initMiniPlayerAutoClose();
    initVisibilityScrollFix();
    initKeyboardShortcuts();
    initEqMessageHandler();
    initVideoObserver();
    initSongObserver();

    // Direct load/refresh to /watch: apply settled state after player animation
    if (isNowPlayingPage()) {
      setTimeout(() => {
        if (!isNowPlayingPage()) return;
        document.body.classList.add('ytm-ext-settled');
        updatePageState();
      }, 350);
    }

    // Update unified album art periodically (clear any existing interval first)
    if (mainUpdateInterval) clearInterval(mainUpdateInterval);
    mainUpdateInterval = setInterval(() => {
      checkAndUpdate();
      updateUnifiedAlbumArt();
    }, 2000);

    resizeHandler = () => {
      requestAnimationFrame(positionToggleBetweenHeaderAndVideo);
      if (settings.animatedEnabled && ambientImg) startAmbientAnimation();
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('beforeunload', destroyExtension);

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
