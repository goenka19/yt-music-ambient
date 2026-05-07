# Codex Handoff — Synced Lyrics Bug + Pending CSS

## Status
Branch: `fix/lyrics-fullscreen`
`styles.css` has uncommitted changes (transitions). `content.js` has the bug described below — NOT yet fixed.

---

## Bug 1 — Related content bleeds into lyrics / Up Next→Lyrics requires workaround

### Symptom
- After switching from Up Next → Lyrics, synced lyrics don't show. Navigating to Related tab and back to Lyrics then shows them.
- Occasionally Related content (cards, shelf items) appears visually inside the Lyrics tab area.

### Root cause — one line, `content.js` line 1651

`renderSyncedLyrics()` uses a 4-tier fallback to find where to insert the lyrics container:

- **TIER 1** — caller passes a real `ytmusic-description-shelf-renderer` element directly.
- **TIER 2** — searches DOM for `ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]`, then looks for the shelf inside it.
- **TIER 3** — neither is ready → stores `pendingLyricsData`, returns, waits for MutationObserver.
- **TIER 4** — all failed, logs error.

The bug is in TIER 2 (lines 1642–1654):

```javascript
// TIER 2: Find Lyrics tab renderer by page-type
if (!targetParent) {
  const lyricsRenderer = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
  if (lyricsRenderer) {
    const shelf = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer');
    if (shelf) {
      shelfRenderer = shelf;
      targetParent = shelf;
    } else {
      targetParent = lyricsRenderer;   // ← LINE 1651: THE BUG
    }
  }
}
```

When the user clicks Lyrics from Up Next, YTM inserts the `ytmusic-tab-renderer` immediately but renders `ytmusic-description-shelf-renderer` inside it ~200–400 ms later.

TIER 2 finds the tab renderer, doesn't find the shelf yet, and hits the `else` — setting `targetParent = lyricsRenderer`. Execution **never reaches TIER 3**. The lyrics container is appended to the bare tab renderer. Then YTM renders the shelf (with its own content — related cards, "unavailable" message, etc.) into the same element, displacing or mixing with our container.

TIER 3 already has the correct logic for this case: store `pendingLyricsData` and return; the MutationObserver fires again when the shelf appears with a real element, TIER 1 succeeds, rendering works.

### The fix — remove line 1651

Delete `targetParent = lyricsRenderer;` from the `else` branch. Do not replace it with anything.

**Before (lines 1642–1654):**
```javascript
// TIER 2: Find Lyrics tab renderer by page-type
if (!targetParent) {
  const lyricsRenderer = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
  if (lyricsRenderer) {
    const shelf = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer');
    if (shelf) {
      shelfRenderer = shelf;
      targetParent = shelf;
    } else {
      targetParent = lyricsRenderer;
    }
  }
}
```

**After:**
```javascript
// TIER 2: Find Lyrics tab renderer by page-type
if (!targetParent) {
  const lyricsRenderer = document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
  if (lyricsRenderer) {
    const shelf = lyricsRenderer.querySelector('ytmusic-description-shelf-renderer');
    if (shelf) {
      shelfRenderer = shelf;
      targetParent = shelf;
    }
    // No else — if shelf not yet rendered, fall through to TIER 3 which waits for MutationObserver
  }
}
```

### Also remove: redundant external shelf guards (added as a workaround, now unnecessary)

Four locations have an `shelfPending` guard added to work around the TIER 2 bug. After the TIER 2 fix these are noise and should be removed.

**Location 1 — `enhanceLyrics` success path (~lines 1895–1910):**

Remove:
```javascript
const _ltr = document.querySelector(
  'ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]'
);
const shelfPending = _ltr && !_ltr.querySelector('ytmusic-description-shelf-renderer');
if (!shelfPending) {
  renderSyncedLyrics(freshEl, parsed);
  if (freshEl) freshEl.dataset.synced = 'true';
}
// else: shelf still loading — observer fires when YTM inserts it;
// lyricsElement will be non-null, Branch 1 calls enhanceLyrics(lyricsElement)
```

Replace with:
```javascript
renderSyncedLyrics(freshEl, parsed);
if (freshEl) freshEl.dataset.synced = 'true';
```

**Location 2 — MutationObserver Branch 3 (~lines 2127–2135):**

Remove:
```javascript
} else if (!containerExists && !lyricsElement && pendingLyricsData) {
  const _ltr = document.querySelector(
    'ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]'
  );
  if (!(_ltr && !_ltr.querySelector('ytmusic-description-shelf-renderer'))) {
    currentSongTitle = getSongTitle();
    renderSyncedLyrics(null, pendingLyricsData);
    pendingLyricsData = null;
  }
```

Replace with:
```javascript
} else if (!containerExists && !lyricsElement && pendingLyricsData) {
  currentSongTitle = getSongTitle();
  renderSyncedLyrics(null, pendingLyricsData);
  pendingLyricsData = null;
```

**Location 3 — `onSongChange` pending branch (~lines 2015–2023):**

Same pattern as Location 2. Remove the `_ltr` / `shelfPending` guard, keep only:
```javascript
} else if (!containerExists && !lyricsElement && pendingLyricsData) {
  currentSongTitle = getSongTitle();
  renderSyncedLyrics(null, pendingLyricsData);
  pendingLyricsData = null;
```

**Location 4 — `lyricsTransitionInterval` immediate check (~lines 2239–2247):**

Same pattern. Remove the `_ltr` / `shelfPending` guard, keep only:
```javascript
} else if (!containerExists && !lyricsElement && pendingLyricsData) {
  currentSongTitle = getSongTitle();
  renderSyncedLyrics(null, pendingLyricsData);
  pendingLyricsData = null;
```

---

## Bug 2 — CSS transitions missing (uncommitted, styles.css)

These changes are already in the working tree but uncommitted. Verify they exist before touching anything:

In `styles.css`, the following transition rules should be present:

**`body.fullscreen-active #ytm-ext-unified-art`** — should include `transition: right 0.3s ease`

**`.fs-album`** — should include `transition: width 0.3s ease`

**`.fs-lyrics`** — should include `transition: width 0.3s ease, opacity 0.3s ease, padding 0.3s ease`

If any are missing, add them. If they're already there, leave them alone.

---

## What NOT to change

- Do not touch TIER 1, TIER 3, or TIER 4 logic in `renderSyncedLyrics`.
- Do not touch `isOnLyricsTab()`, `isContainerInLyricsTab()`, or `getLyricsTabElement()`.
- Do not touch the `containerExists && pendingLyricsData` branches — those are correct (a container existing means the shelf was already ready when created).
- Do not add new guards, timers, or retry logic. The TIER 3 MutationObserver retry is already in place and correct.
- `background.js` is already correct (fetch timeout applied).

---

## Commit instructions

1. Stage: `content.js`, `styles.css`
2. Commit message: `fix: TIER 2 shelf-not-ready causes related content bleed and Up Next→Lyrics workaround`
3. Branch: `fix/lyrics-fullscreen` (already on this branch)
