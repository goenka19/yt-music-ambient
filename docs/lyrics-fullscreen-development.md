# YouTube Music Lyrics - Fullscreen Mode Documentation

## Overview
This document tracks the development of the fullscreen lyrics feature for the YouTube Music Ambient Background extension.

## Current State (as of last session)

### What's Working:
1. ✅ Lyrics appear automatically when song changes in fullscreen
2. ✅ Auto-scroll when current lyric changes (keeps current line visible)
3. ✅ Mode switching (normal ↔ fullscreen) preserves lyrics position

### What's NOT Working as Expected:
1. ❌ Mode switching still has a brief scroll/flash when transitioning
   - When going normal → fullscreen: shows top briefly then jumps to position
   - When going fullscreen → normal: same issue
   - The `requestAnimationFrame` fix didn't fully resolve this

---

## Problems Identified & Solutions Attempted

### Problem 1: Lyrics don't appear when song changes in fullscreen
**Root Cause:** When entering fullscreen, then playing a new song, lyrics were created but not moved to fullscreen container.

**Fix Applied:** Added logic in `renderSyncedLyrics()` to automatically move lyrics to fullscreen container after creation.

---

### Problem 2: Scroll animation when switching modes
**User Request:** No scrolling should happen when switching between fullscreen and normal mode - lyrics should stay in their current position.

**Root Cause:** When moving DOM element between containers, browser was resetting scroll position.

**Solutions Attempted:**
1. Save scrollTop before move, restore after - still had flash
2. Use requestAnimationFrame to restore scrollTop - still not perfect

**Current Implementation:**
```javascript
// In createFullscreenUI() and removeFullscreenUI():
const scrollTop = lyricsEl.scrollTop;
// Move element
lyricsWrapper.appendChild(lyricsEl);
// Restore in next animation frame
requestAnimationFrame(() => {
  lyricsEl.scrollTop = scrollTop;
});
```

**Status:** Still has brief flash/visible jump during mode transition

---

### Problem 3: No auto-scroll on first song in fullscreen
**Root Cause:** At song start, video.currentTime = 0, no lyrics match, so index stays -1 and scroll condition failed.

**Fix Applied:** Changed scroll logic to always trigger on first run.

---

### Problem 4: Partial lines visible at bottom
**Root Cause:** Container height didn't align with line-height, causing cut-off lines.

**Fix Applied:** Changed to `max-height: calc(2.2em * 6)` in CSS to show exactly 6 lines.

---

## Key Code Locations

### content.js
- `renderSyncedLyrics()` (lines ~246-309): Creates lyrics container, moves to fullscreen if needed
- `startSync()` (lines ~305-380): Handles lyric sync with video time, auto-scroll on line change
- `createFullscreenUI()` (lines ~536-583): Creates fullscreen UI, moves lyrics with scroll preservation
- `removeFullscreenUI()` (lines ~578-599): Removes fullscreen UI, moves lyrics back with scroll preservation
- `scrollToCurrentLyric()` (lines ~525-536): Helper function (currently unused)

### styles.css
- `.fs-lyrics` (lines ~386-400): Fullscreen lyrics container styling
- `body.fullscreen-active #ytm-ext-synced-lyrics` (lines ~404-423): Fullscreen lyrics positioning with max-height

---

## User Requirements (for future reference)

1. **Mode switching:** NO scrolling animation - lyrics should stay at current position seamlessly (like Apple)
2. **Line changes:** Auto-scroll to keep current line visible (working)
3. **New songs in fullscreen:** Should appear automatically (working)
4. **Partial lines:** Should be hidden - no cut-off lines (CSS fix applied)

---

## Next Steps (for future debugging)

1. **Investigate scroll flash:**
   - The issue might be that scrollTop is being reset by YouTube Music's own code
   - Could try using CSS `position: fixed` instead of moving DOM element
   - Could try preserving scroll as percentage rather than pixels

2. **Alternative approach:**
   - Keep lyrics in both containers simultaneously (clone, don't move)
   - Or use a single shared container that's styled differently based on mode

3. **Testing approach:**
   - Add detailed console logs to trace exact scroll values during mode switch
   - Test with different scroll positions (top, middle, bottom of lyrics)
   - Test with songs at different timestamps

---

## Files Modified
- `/content.js` - Core lyrics sync and fullscreen logic
- `/styles.css` - Fullscreen styling and positioning

---

*Last Updated: Session with user on lyrics fullscreen feature development*
