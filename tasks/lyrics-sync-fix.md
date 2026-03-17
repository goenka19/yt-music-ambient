# Lyrics Sync Fix — Player Bridge (March 2026)

## The Bug

During natural song transitions (song ends, next song auto-plays), lyrics would jump to the wrong position (middle/end of song). Clicking on earlier lyrics would play the previous song instead of seeking in the current one.

Manual skips worked fine. Only natural transitions were broken.

## Root Cause

YouTube Music uses **MSE (MediaSource Extensions) gapless playback**. It pre-buffers the next song and appends it to the same MediaSource buffer. During natural transitions:

- `video.currentTime` **never resets to 0** — it keeps incrementing continuously across songs (e.g., 431 → 453 → 480+)
- `video.duration` keeps growing as songs are appended (456 → 520+)
- `video.currentTime = 22` would seek to a position in the **previous song's** buffer region

This means `video.currentTime` is fundamentally unusable for per-song position during gapless playback.

## Why The First Fix Failed

YouTube's `#movie_player` element exposes a JS API with correct per-song values:
- `player.getCurrentTime()` → correct position within current song
- `player.getDuration()` → correct duration of current song
- `player.seekTo(seconds, true)` → seeks within current song

The first attempt called these methods directly from `content.js`. This **silently failed** because Chrome content scripts run in an **isolated world** — they share the DOM with the page but cannot access custom JavaScript methods attached to DOM elements by the page's scripts. The element exists but all methods are `undefined`.

Symptoms: zero sync ticks logged, `Player duration: null`, no highlighting at all.

## The Working Fix: MAIN World Bridge

### Architecture

```
MAIN world (player-bridge.js)          ISOLATED world (content.js)
┌─────────────────────────┐            ┌──────────────────────────┐
│ Has access to:          │            │ Has access to:           │
│  player.getCurrentTime()│  ──DOM──>  │  bridge.dataset.time     │
│  player.getDuration()   │  ──DOM──>  │  bridge.dataset.duration │
│  player.seekTo()        │  <─Event─  │  dispatch 'ytm-ext-seek' │
└─────────────────────────┘            └──────────────────────────┘
        │                                        │
        └──── Shared DOM element ────────────────┘
              #ytm-ext-player-bridge (hidden div)
```

A small script (`player-bridge.js`) runs in the MAIN world (page context) via `"world": "MAIN"` in manifest.json. It:
1. Creates a hidden `<div id="ytm-ext-player-bridge">` on the page
2. Every 150ms, reads `player.getCurrentTime()` and `player.getDuration()` and writes them to `bridge.dataset.time` and `bridge.dataset.duration`
3. Listens for `ytm-ext-seek` CustomEvents and calls `player.seekTo()`

The content script reads time/duration from the bridge element's dataset (DOM is shared across worlds) and dispatches CustomEvents to seek.

### Files Changed

1. **`player-bridge.js`** (NEW) — MAIN world script, ~25 lines
2. **`manifest.json`** — Added second content_scripts entry with `"world": "MAIN"`
3. **`content.js`** — Added 3 helper functions, updated 4 call sites

### Helper Functions in content.js

```javascript
function getPlayerTime()     // Reads bridge.dataset.time, falls back to video.currentTime
function getPlayerDuration() // Reads bridge.dataset.duration
function seekPlayer(time)    // Dispatches CustomEvent to bridge
```

### Call Sites Updated

| Location | Old (broken) | New (working) |
|----------|-------------|---------------|
| `startSync()` sync loop | `cachedPlayer.getCurrentTime()` | `getPlayerTime()` |
| Click-to-seek in `renderSyncedLyrics()` | `player.seekTo(lyricTime, true)` | `seekPlayer(lyricTime)` |
| Fullscreen lyrics scroll | `player.getCurrentTime()` | `getPlayerTime()` |
| Duration fetch in `enhanceLyrics()` | `player.getDuration()` | `getPlayerDuration()` |

## Key Facts for Future Debugging

1. **`video.currentTime` is wrong during gapless playback** — it reports MSE cumulative time, not per-song time
2. **Content scripts cannot call custom JS methods on DOM elements** — Chrome's isolated world blocks this
3. **DOM elements and their `dataset` properties ARE shared** between MAIN and ISOLATED worlds
4. **CustomEvents dispatched on `document` ARE received** by both worlds
5. **`"world": "MAIN"` in manifest.json** requires Chrome 111+ (stable since March 2023)
6. **Non-lyrics code is not affected** — mini player uses `video.paused` (standard DOM property, works in isolated world)

## How to Verify

1. Open DevTools console on YouTube Music
2. `document.getElementById('ytm-ext-player-bridge')` — should exist
3. `document.getElementById('ytm-ext-player-bridge').dataset.time` — should show a number that updates
4. Play a song, let it naturally transition → lyrics should start at beginning
5. Click a lyric → should seek within current song
6. Console should show `sync tick #1, time: X.XX` where X is near 0 for a new song

## Session ID Pattern (unchanged, still in use)

`syncSessionId` is incremented on every song change. Async functions capture it and check after awaits. If the ID changed, they abort. This prevents stale lyrics from a previous song from being displayed after rapid skipping.
