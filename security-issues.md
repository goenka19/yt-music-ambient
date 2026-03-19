# Security, Memory Leak & Performance Audit

**Date:** 2026-03-19
**Scope:** Full codebase audit of content.js, player-bridge.js, background.js, popup.js, styles.css

Beyond the 4 originally reported issues, a deep audit found **22 additional issues** (26 total).

---

## HIGH SEVERITY

### H1. Multiple content script instances race on reload
- **File:** `content.js` top of IIFE
- No guard prevents `init()` running twice on extension reload, creating duplicate intervals/observers/DOM elements.
- **Fix:** Add `if (window.__ytmExtLoaded) return; window.__ytmExtLoaded = true;` at IIFE top.

### H2. 3 redundant MutationObservers on document.body
- **File:** `content.js:143, 209, 1077`
- All 3 watch `document.body` with `subtree: true`. Each DOM mutation triggers all 3 callbacks. `lyricsObserver` has zero debounce.
- **Fix:** Consolidate into 1 observer with a single debounced handler that dispatches to URL-check, lyrics-check, and ambient-update paths.

### H3. enhanceLyrics() race condition (called concurrently)
- **File:** `content.js:935-1016, 1077-1088`
- `lyricsObserver` fires on every mutation with no debounce. Multiple `enhanceLyrics()` async calls can race — multiple LRCLIB fetches, multiple `startSync()` intervals.
- **Fix:** `dataset.synced = 'processing'` already partially guards, but the check at line 1085 happens before the dataset is set in the async call. Add debounce to the lyricsObserver callback, or consolidate with H2.

### H4. player-bridge.js 150ms interval not cleared on unload
- **File:** `player-bridge.js:17-24`
- Interval stored in `bridge.dataset.intervalId` but only cleared on reload, not on page unload.
- **Fix:** Add `window.addEventListener('unload', function() { clearInterval(intervalId); })` in player-bridge.js.

---

## MEDIUM SEVERITY

### M1. Intervals never cleared on unload (Original Issue 1)
- **File:** `content.js` — 5 intervals (`mainUpdateInterval`, `miniPlayerAutoCloseInterval`, `visibilityScrollInterval`, `syncInterval`, `pipSyncInterval`) + 1 timeout (`window.ambientUpdateTimeout`)
- **Fix:** Add a `destroyExtension()` function that clears all intervals and disconnects observers. Wire it to `window.addEventListener('beforeunload', destroyExtension)`.

### M2. Observers never disconnected (Original Issue 2)
- **File:** `content.js:143, 209, 1077`
- 3 MutationObservers created, never `disconnect()`ed.
- **Fix:** Handled by `destroyExtension()`. If H2 is done (consolidation), only 1 observer to disconnect.

### M3. Event listeners use anonymous functions (Original Issue 4)
- **File:** `content.js:39, 206, 556, 1250`
- 4 listeners added with anonymous/arrow functions — can never be removed.
- **Fix:** Extract to named module-level variables (`storageChangeHandler`, `urlChangeHandler`, `keydownHandler`, `fullscreenHandler`). Remove them in `destroyExtension()`.

### M4. isVideoModeV2() forces reflow every 2 seconds
- **File:** `content.js:1266-1281`
- `getBoundingClientRect()` + `getComputedStyle()` called on every `updateUnifiedAlbumArt()` invocation (2s polling interval).
- **Fix:** Cache video mode state; only recheck on fullscreenchange or when mutation observer detects video element changes.

### M5. getAlbumArtUrl() runs 8 querySelector loops repeatedly
- **File:** `content.js:83-94`
- Called 3+ times per 2s poll cycle (in `checkAndUpdate`, `syncMiniPlayerState`, `updateUnifiedAlbumArt`) = 24+ DOM queries every 2 seconds.
- **Fix:** Cache the art URL and the working selector index. Invalidate cache only when `src` attribute mutation is observed.

### M6. updateUnifiedAlbumArt() excessive DOM queries in hot path
- **File:** `content.js:1313-1369`
- 4+ `getElementById`/`querySelector` calls every 2 seconds for elements that rarely change.
- **Fix:** Cache element references at creation time in module-level variables.

### M7. urlObserver has no debounce
- **File:** `content.js:209-210`
- Watches `document.body` for any childList change, fires `onUrlChange()` 100+ times during SPA navigation. Each call runs `updatePageState()`, `checkAndUpdate()`, recreates UI.
- **Fix:** Debounce `onUrlChange()` or consolidate with H2.

### M8. Rapid clicks can open multiple PiP windows
- **File:** `content.js:312-316`
- `openMiniPlayer()` is async; `pipWindow` is null until `requestWindow()` resolves. Rapid clicks or 'P' key presses call it twice before the first resolves.
- **Fix:** Add `let pipWindowOpening = false;` guard. Set true before `await requestWindow()`, false after.

### M9. Image preload creates orphaned Image objects
- **File:** `content.js:280-282`
- `new Image()` with `img.src` set but no `onload`/`onerror` handlers — browser holds the request until GC.
- **Fix:** Add `img.onerror = () => {};` so browser can release the request promptly.

### M10. No error handling on chrome.runtime.sendMessage
- **File:** `content.js:960`, `popup.js:62-80`, `background.js:24-65`
- If background service worker crashes, `sendMessage` promise rejects with no catch → unhandled promise rejection.
- `fetchLyrics()` in background.js has no try/catch around the `sendResponse` path → if fetch fails, no response sent, content script hangs.
- **Fix:** Wrap `sendMessage` in try/catch in content.js. Add try/catch around `fetchLyrics()` in background.js to always call `sendResponse`.

### M11. fullscreenchange callback not guarded against rapid entry/exit
- **File:** `content.js:1250-1259`
- No re-entry guard in the callback. If fullscreen is entered and exited within a single animation frame, `createFullscreenUI()` and `removeFullscreenUI()` can overlap, corrupting `originalLyricsParent`.
- **Fix:** Use the existing `isTransitioningFullscreen` flag to skip if already transitioning.

---

## LOW SEVERITY

### L1. XSS via art URL in CSS url() (Original Issue 3)
- **File:** `content.js:125, 450, 500` — template string interpolation in `style.backgroundImage`.
- **File:** `content.js:429-430` — title/artist interpolated into PiP `innerHTML`.
- Risk is LOW because URLs come from Google's image service, but the pattern is unsafe.
- Line 448 has a misleading comment ("Set background image via DOM API to avoid XSS") then immediately uses string interpolation.
- **Fix:** Add `sanitizeUrl()` helper using `new URL()` to validate protocol (http/https only) and normalize. Apply in `getAlbumArtUrl()` return path — single change covers all 3 CSS sites. Wrap title/artist with existing `escapeHtml()` in PiP innerHTML.

```javascript
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href; // Normalized, percent-encoded, safe
    }
  } catch (e) {}
  return null;
}
```

### L2. Dead code: DOMContentLoaded check with document_idle
- **File:** `content.js:1498-1502`
- Script runs at `document_idle` (manifest.json), so `readyState === 'loading'` is never true. The `DOMContentLoaded` listener is dead code.
- **Fix:** Remove the conditional; just call `init()`.

### L3. CSS animations lack GPU hints
- **File:** `styles.css` — `.ambient-layer` uses `filter: blur(50px)` (CPU-rendered) and `transform: scale(1.5)` (GPU) but no `will-change` hint.
- 3 animated layers running 12-18s infinite animations without compositor hints.
- **Fix:** Add `will-change: transform` to `.ambient-container.animated .ambient-layer`.

### L4. Lyrics cache grows unbounded
- **File:** `background.js` — `chrome.storage.local.set({ [cacheKey]: lyrics })` per song, no TTL or size limit.
- After thousands of songs, approaches chrome.storage.local's ~10MB quota.
- **Fix:** Implement simple LRU: store a key list, evict oldest when count > 500.

### L5. Settings load race — brief flicker of defaults
- **File:** `content.js:28-35, 1460-1496`
- `loadSettings()` is async (callback-based) but `init()` doesn't await it. `checkAndUpdate()` runs immediately with defaults (`ambientEnabled: true`). If user disabled ambient, they see it flash briefly.
- **Fix:** Make `init()` async, `await` the storage load before `checkAndUpdate()`.

### L6. syncSessionId state management fragility
- **File:** `content.js:596, 1025`
- `syncSessionId` incremented only in `checkSongChange()`. `startSync()` reads it but doesn't increment. Currently correct, but adding another increment elsewhere would silently break the session chain.
- **Fix:** Add a comment documenting the invariant. No code change needed.

---

## Files to Modify

| File | Issues |
|------|--------|
| `content.js` | H1, H2, H3, M1-M11, L1-L2, L5-L6 |
| `player-bridge.js` | H4, M3 (seek listener guard) |
| `styles.css` | L3 |
| `background.js` | M10, L4 |
| `popup.js` | M10 |

---

## Implementation Phases

### Phase 1: Guards & Cleanup (H1, M1, M2, M3, H4)
1. Add `if (window.__ytmExtLoaded) return;` guard at top of content.js IIFE
2. Add handler reference variables for the 4 anonymous listeners
3. Refactor 4 anonymous listeners to named references
4. Add `destroyExtension()` function (clears intervals, disconnects observers, removes listeners, closes PiP)
5. Wire `beforeunload` → `destroyExtension()` in `init()`
6. Add seek listener guard in `player-bridge.js` (DOM-based, since it runs in MAIN world)
7. Add unload handler in `player-bridge.js`

### Phase 2: Observer Consolidation (H2, H3, M7)
8. Replace 3 separate MutationObservers with 1 consolidated observer
9. Add debounce to the unified observer callback (100ms, matching existing pattern)
10. Route mutations to: URL check, lyrics check, ambient update — in a single debounced handler
11. Keep `attributeFilter: ['src']` for album art detection

### Phase 3: XSS Fixes (L1)
12. Add `sanitizeUrl()` helper
13. Apply in `getAlbumArtUrl()` return path
14. Wrap title/artist with `escapeHtml()` in PiP innerHTML
15. Fix misleading comment on line 448

### Phase 4: Performance (M4, M5, M6, M8, M9)
16. Cache element references in `updateUnifiedAlbumArt()` (container, img, wrapper)
17. Cache art URL in `getAlbumArtUrl()` — invalidate on `src` mutation
18. Cache `isVideoModeV2()` result — invalidate on fullscreen/mutation
19. Add `pipWindowOpening` guard to `openMiniPlayer()`
20. Add `onerror` handler to preloaded images

### Phase 5: Error Handling & Cleanup (M10, M11, L2, L3, L5)
21. Wrap `chrome.runtime.sendMessage` in try/catch in content.js
22. Add try/catch in background.js `fetchLyrics()` to always send response
23. Add re-entry guard to fullscreenchange callback
24. Remove dead `DOMContentLoaded` branch
25. Add `will-change: transform` to animated layers in styles.css
26. Make `init()` async, `await` the storage load before first render

### Phase 6: Cache Management (L4)
27. Add LRU eviction to lyrics cache in background.js (max 500 entries)

---

## Verification Checklist

1. Reload extension in `chrome://extensions/`
2. Navigate to `music.youtube.com`, play a song
3. Verify ambient background renders correctly
4. Verify synced lyrics load and sync with playback
5. Verify mini player arm/disarm/open/close works
6. Open DevTools console — no errors
7. Navigate between pages (SPA) — features persist, no errors
8. Full page reload — features reinitialize cleanly, no duplicate observers
9. Reload extension while on page — no duplicate intervals in console
10. Rapid-click mini player button — only 1 PiP window opens
11. Enter/exit fullscreen rapidly — no UI glitches
12. Performance tab — check for reduced forced reflows vs. before

---

## Edge Cases to Watch

- `beforeunload` may not fire on extension reload — guard flags prevent re-attachment within same script instance
- `new URL()` on relative URLs — `img.src` always returns absolute URLs, so safe
- `sanitizeUrl` returning null — all callers already handle null from `getAlbumArtUrl()`
- player-bridge.js runs in MAIN world — can't share closure references across reloads, must use DOM-based guard
- `popstate` listener in player-bridge.js — already guarded by `__ytmExtHistoryPatched` on `window`, no fix needed
- Observer consolidation must preserve `attributeFilter: ['src']` behavior for album art detection
- `enhanceLyrics()` debounce must not delay first render too much — 100ms max
