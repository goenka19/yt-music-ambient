# Lessons Learned

## Chrome Extension Development

### Manifest V3 Permissions (2024-03)

**Problem:** `chrome.scripting.executeScript()` failed with "Extension manifest must request permission to access this host"

**Root cause:** In Manifest V3, `host_permissions` are separate from `permissions`. Content script `matches` patterns do NOT grant host access for `executeScript()`.

**Fix:** Add explicit `host_permissions`:
```json
"host_permissions": ["*://music.youtube.com/*"]
```

**Rule:** When using `chrome.scripting.executeScript()`, always add the target URL pattern to `host_permissions`.

---

### Content Script Message Passing (2024-03)

**Problem:** `chrome.tabs.sendMessage()` failed with "Could not establish connection. Receiving end does not exist"

**Root cause:** Content scripts only inject into pages loaded AFTER extension install/reload. Pre-existing tabs don't have the content script.

**Fix:** Use `chrome.scripting.executeScript()` instead of message passing for one-off actions. It injects code directly without requiring a pre-loaded listener.

**Rule:** For actions that must work on any matching tab (regardless of when it was opened), prefer `executeScript()` over message passing.

---

### DOM Element Targeting (2024-03)

**Problem:** Code queried `#play-pause-button` but checked `aria-label` which returned empty string.

**Root cause:** YouTube Music's play button structure:
```html
<yt-icon-button id="play-pause-button">  <!-- NO aria-label -->
  <button aria-label="Pause">           <!-- aria-label is HERE -->
</yt-icon-button>
```

**Fix:** Target the inner button: `#play-pause-button button`

**Rule:** Always inspect the actual DOM structure. Attributes like `aria-label` are often on nested elements, not the outer wrapper.

---

### CSS Attribute Selectors Are Dangerous (2024-03)

**Problem:** Added `[style*="background"]` selector to make elements with inline background styles transparent. This broke the entire ambient background effect.

**Root cause:** The selector `[style*="background"]` matched the extension's own `.ambient-layer` elements, which get their background set via JavaScript: `layer.style.backgroundImage = url(...)`. Making these transparent destroyed the whole effect.

**Fix:** Removed the broad selector. Used DevTools to inspect the actual element causing the gray box, then added a targeted rule for `#song-media-window`.

**Rule:** NEVER use attribute selectors like `[style*="..."]` or wildcards like `element *`. They match unintended elements including your own extension's components. Always use DevTools to identify the exact element, then target it specifically.

---

### CSS Scale Creates Container Gap (2024-03)

**Problem:** Added `scale: 0.90` to album art element thinking it would help with spacing. This caused a gray border to appear around the album art.

**Root cause:** When you scale an element smaller, its container stays the same size. The gap between the smaller element and its container shows the container's background color (gray).

**Also caused:** Control buttons (fullscreen, etc.) that were positioned on the album art appeared outside it, because they're positioned relative to the original size.

**Fix:** Remove the scale. If you need smaller content, consider scaling the entire container instead, or adjusting container dimensions to match.

**Rule:** Be careful with CSS `scale` - it only affects visual rendering, not layout. The element's original dimensions remain for layout purposes, which can create unexpected gaps or positioning issues.

---

### Comet Browser: document.hasFocus() Unreliable (2024-03)

**Problem:** Added `document.hasFocus()` polling to detect window focus changes. This broke the auto-close functionality completely.

**Root cause:** Comet browser (Chromium-based) does not implement standard focus/visibility APIs correctly:
- `visibilitychange` event: Does NOT fire
- `focus`/`blur` events: Do NOT fire
- `document.hasFocus()` polling: Returns unreliable values

**What works:** Only `document.hidden` (polled) works reliably in Comet for detecting tab visibility changes.

**Fix:** Removed `document.hasFocus()` entirely. Only use `document.hidden` for visibility detection.

**Rule:** In Comet browser, ONLY trust `document.hidden`. Do not use `document.hasFocus()`, `visibilitychange`, `focus`, or `blur` - none of these work correctly.

---

### Lyrics Sync Race Condition (2024-03)

**Problem:** When skipping songs, lyrics would jump to the middle/end of the song instead of starting at the beginning.

**Root cause:** Race condition between DOM and video element:
1. DOM updates (song title changes) → we detect this
2. We fetch lyrics for NEW song
3. We start sync after `readyState >= 3`
4. BUT `video.currentTime` still reports OLD song's time (e.g., 346s)
5. Video element lags behind DOM by several hundred milliseconds

**Console logs showed:**
```
sync tick #1, time: 346.89   ← OLD song's time!
Line changed to index: 53    ← Jumped to wrong position
```

**Why previous fixes didn't work:**
- `readyState >= 3` doesn't mean time has reset, just "has data to play"
- `500ms delay` isn't enough - video can still be transitioning
- Debouncing wrong approach - this is about video state, not event frequency

**Fix:** Add check in `waitForValidTime()`:
```javascript
if (video.currentTime > 5) {
  setTimeout(waitForValidTime, 100);
  return;
}
```

**Why this works:** A new song ALWAYS starts at time ≈ 0. By waiting for `currentTime < 5`, we ensure the video has actually loaded the new song.

**Rule:** When syncing to media elements, don't just check if the element is "ready" - verify that its time/state makes sense for the CURRENT content. A new song can't start at 346 seconds.

---

### Video Player DOM Hierarchy (2024-03)

**Problem:** Needed to add `margin-top` to push the video down in video mode. Targeted `#song-media-window` based on diagnostic bounding rects. It didn't work -- the actual video is rendered by `#movie_player` (YouTube's embedded player), which is a child of `#song-media-window` but positioned independently.

**Root cause:** YouTube Music's video mode uses this hierarchy:
```
#song-media-window (container - our diagnostic showed rect here)
  └─ #movie_player (YouTube's actual video player - this is what renders)
       └─ .html5-video-container
            └─ video.html5-main-video
```

The diagnostic tested `margin-top` on `#song-media-window` and it "moved" (bounding rect changed), but the visual video didn't move because `#movie_player` has its own positioning inside.

**Fix:** Target `#movie_player` directly, not `#song-media-window`.

**Rule:** When targeting YouTube's video element for positioning:
1. The visible video is rendered by `#movie_player`, NOT `#song-media-window`
2. Diagnostics that test bounding rect changes can be misleading -- the rect of a wrapper may shift without the inner positioned element moving visually
3. Always ask the user to inspect the actual visible element, or test by visually confirming the change (not just rect numbers)
4. When a diagnostic says "margin worked" but the user says it didn't -- the diagnostic was measuring the wrong thing

---

### Diagnostic Design Failures (2024-03)

**Problem:** Wrote a diagnostic that tested `margin-top` on `#song-media-window`, confirmed the bounding rect moved (+12px), and confidently shipped the fix. It didn't visually move the video.

**Root cause:** The diagnostic measured rect change on the wrapper, not on the actual visual element. A wrapper's rect can change without its absolutely/independently positioned children moving.

**Fix:** Diagnostics for visual positioning must either:
1. Test on the actual visual element (not a wrapper)
2. Or ask the user to visually confirm the element moved on screen

**Rule:** Never trust `getBoundingClientRect()` changes on wrapper elements as proof that the visual content inside moved. Test on the innermost visual element, or have the user visually verify.
