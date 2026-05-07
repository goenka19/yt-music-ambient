# AGENTS.md — Development Guide

This file is read automatically by Codex and serves as a codebase guide for contributors.

## Project Overview

YouTube Music Ambient Background is a Chrome Extension (Manifest V3) that adds Apple Music-style effects to YouTube Music. It extracts album art and renders it as a blurred, saturated background that dynamically changes with each song.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                YouTube Music Web Page                    │
├─────────────────────────────────────────────────────────┤
│  content.js (ISOLATED world)                            │
│  ├─ Album Art Extraction (8 fallback selectors)         │
│  ├─ Ambient Background Renderer                         │
│  ├─ Synced Lyrics (LRCLIB API via background.js)        │
│  ├─ Fullscreen UI (album art + lyrics layout)           │
│  ├─ Mini Player (Document Picture-in-Picture)           │
│  ├─ Sidebar Toggle                                      │
│  ├─ Equalizer (Web Audio API — in progress)             │
│  └─ MutationObserver + polling for song changes         │
├─────────────────────────────────────────────────────────┤
│  player-bridge.js (MAIN world — accesses player API)    │
│  ├─ Polls YouTube's #movie_player for currentTime       │
│  └─ Patches history.pushState to fire URL change events │
├─────────────────────────────────────────────────────────┤
│  background.js (Service Worker)                         │
│  ├─ Sleep timer (chrome.alarms)                         │
│  └─ Lyrics fetcher (LRCLIB API, with caching)           │
├─────────────────────────────────────────────────────────┤
│  popup.html / popup.js / popup.css                      │
│  └─ Settings UI: toggles, sleep timer, EQ panel        │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (MV3), permissions, host access |
| `content.js` | Core engine — background, lyrics, fullscreen, EQ, PiP |
| `styles.css` | All visual effects and YouTube UI overrides |
| `background.js` | Sleep timer and LRCLIB lyrics fetching |
| `player-bridge.js` | Bridge to YouTube's player API (runs in MAIN world) |
| `popup.html/js/css` | Extension popup UI |

## Development Commands

### Load the Extension
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. Navigate to `music.youtube.com`

### Reload After Changes
- Edit `content.js` or `styles.css` → click the refresh icon on the extension card
- Edit `manifest.json` → remove and re-add the extension

### Launch Chrome for Testing
```bash
./launch-chrome.sh
```
Opens Chrome with the extension loaded and remote debugging on port 9222.

## Code Patterns

### IIFE Wrapper
`content.js` is wrapped in `(function() { 'use strict'; ... })()` for scope isolation. The guard `window.__ytmExtLoaded` prevents double initialization.

### Selector Resilience
Album art extraction uses 8 fallback CSS selectors to handle different YouTube Music UI states. YouTube frequently changes its DOM — always add fallbacks.

```javascript
const ALBUM_ART_SELECTORS = [
  'ytmusic-player-bar .image',
  // ... 7 more fallbacks
];
```

### Cleanup Pattern
All intervals, observers, and event listeners are stored in named variables and cleaned up in `destroyExtension()`, which fires on `beforeunload`.

### Two-World Architecture
`player-bridge.js` runs in the MAIN world to access YouTube's player API (`#movie_player.getCurrentTime()`). It communicates with `content.js` via DOM dataset attributes and custom events (`ytm-ext-url-change`, `ytm-ext-seek`).

### Image Preloading
New album art is preloaded via `new Image()` before updating the background for smooth transitions.

## Important Notes

- All CSS overrides use `!important` to override YouTube's inline styles
- Album art URLs are upgraded from thumbnail size to `w1200-h1200` resolution
- The ambient background uses `z-index: -1` to stay behind all content
- YouTube Music uses custom elements (`ytmusic-*`) — selectors target these specifically
- Lyrics are fetched from [LRCLIB](https://lrclib.net) (free, no auth required)

## Debugging DOM/CSS Issues

Before writing any positioning code:
1. Log ALL candidate selectors and their bounding rects in **one** diagnostic pass
2. Never assume a selector works without verifying the element exists
3. The visible video element is `#movie_player` — not `#song-media-window` (a wrapper)

## Status

| Feature | Status |
|---------|--------|
| Dynamic ambient background | ✅ Complete |
| Synced lyrics panel | ✅ Complete |
| Mini player (PiP) | ✅ Complete |
| Sleep timer | ✅ Complete |
| Fullscreen mode | ✅ Complete |
| Equalizer (5-band) | 🚧 In Progress |
