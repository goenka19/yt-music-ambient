# YouTube Music Lyrics Sync Problem

## The Issue

**Lyrics highlight is behind the audio on SOME songs** (not all).

When a lyric line is highlighted, the audio has already moved past that line. User reports audio is ~1-2 seconds ahead of the visual highlight.

## Symptoms

1. **Some songs work perfectly** - highlight matches audio
2. **Some songs are broken** - audio is ahead of highlight
3. **User confirms**: "It worked before the recent code changes"

## Current Code (Simplified)

Located in `/Users/ujjwalgoenka/Desktop/Programming/yt-music-ext/content.js`

```javascript
function startSync(lyrics) {
  // Clear previous interval
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  isVideoReady = true;
  let currentIndex = null;
  let cachedVideo = document.querySelector('video');

  function updateSync() {
    if (!cachedVideo || !document.contains(cachedVideo)) {
      cachedVideo = document.querySelector('video');
    }
    if (!cachedVideo) return;

    const time = cachedVideo.currentTime;

    // Find current line
    let index = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= time) {
        index = i;
      } else {
        break;
      }
    }

    // Update highlight if changed
    if (index !== currentIndex) {
      currentIndex = index;
      // ... update DOM to highlight line at index ...
    }
  }

  syncInterval = setInterval(updateSync, 200);
  updateSync();
}
```

## User's Console Logs (Broken Song: "All My Life")

```
[YTM-Ext] Starting lyrics sync, first lyric at: 11.44
[YTM-Ext] sync tick #1, time: 2.48
[YTM-Ext] Line changed to index: -1
[YTM-Ext] sync tick #2, time: 2.68
[YTM-Ext] sync tick #3, time: 2.88
[YTM-Ext] Seeking to time: 11.44
[YTM-Ext] Line changed to index: 0
[YTM-Ext] Seeking to time: 22.18
[YTM-Ext] Line changed to index: 3
```

User says: "When I click on line 3 (time 22.18), the audio plays content from line 4 or 5."

## What Was Tried (All Failed)

1. **Complex detection** - Wait for video events (loadeddata, durationchange) before starting sync. Used songStartTime and relative time calculations. This was too complex and had its own bugs.

2. **Simplified to basics** - Just use video.currentTime directly. No detection, no songStartTime. This is the current code above.

## Key Constraints

- **Cannot use a fixed offset** - Would fix broken songs but break working songs
- **User insists it worked before** - Implies something in the changes broke it
- **Current code is mathematically correct** - If `video.currentTime` is accurate and LRCLIB timestamps are accurate, the sync should work

## Files

- Main code: `content.js`
- Instructions: `CLAUDE.md`
- Lessons learned: `tasks/lessons.md`

## Questions to Investigate

1. Why do some songs work and others don't?
2. What did the old code do differently that made it work?
3. Is `video.currentTime` accurate on YouTube Music?
4. Are LRCLIB timestamps different quality for different songs?
5. Does YouTube Music have different audio versions that don't match LRCLIB?

## Background

- YouTube Music uses a single `<video>` element for audio playback
- Lyrics come from LRCLIB API (timestamps in LRC format: [MM:SS.ss])
- Extension is Manifest V3 Chrome Extension
- Lyrics are displayed in a sidebar panel, highlight scrolls to current line
