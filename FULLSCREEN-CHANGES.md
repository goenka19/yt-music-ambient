# Unified Album Art & Song Info

## Branch: `feature/fullscreen-autohide`

## Overview

This update consolidates the album art and track information (title/artist) into a single, persistent component called **Unified Album Art**. This component is visible in both normal and fullscreen modes and maintains a consistent layout, scaling, and position as the user interacts with the application.

## Core Features

1.  **Unified Album Art & Song Info**
    *   A single DOM structure used for both normal and fullscreen modes.
    *   Includes high-res album art image + song title + artist name.
    *   Responsive layout that automatically shifts when the sidebar is toggled or when entering fullscreen.
    *   **Fixed Scaling**: Title/Artist text uses a single, consistent font size across all modes (18px for title, 14px for artist) to prevent visual "pumping" or animation during transitions.

2.  **Robust Artist Extraction & Display**
    *   **Full Artist List**: Updated extraction logic to capture all artists (e.g., "Artist A & Artist B") instead of just the first one.
    *   **Smart Parsing**: Automatically removes album/year info (anything after the `•` dot) from the subtitle to keep the display focused.
    *   **Multi-line Support**: The artist name can now wrap up to 2 lines, ensuring collaborators and long names are readable without breaking the layout.

3.  **Fullscreen Auto-Hide Player Bar**
    *   The player bar (controls) is hidden by default in fullscreen mode.
    *   Controls appear on mouse movement and auto-hide after 3 seconds of inactivity.
    *   **Verified Hiding**: Uses JS-based inline style setting + `MutationObserver` to ensure YouTube Music's native JS doesn't override our hiding logic.
    *   **Grace Period**: A 1-second grace period after entering fullscreen prevents the controls from appearing immediately due to the click that triggered it.

4.  **Z-Index Refactoring**
    *   Lowered z-index values for all extension elements to prevent them from covering native YouTube Music UI (like search suggestions).
    *   **Normal Mode**: Elements now sit in the `1-5` range.
    *   **Fullscreen Mode**: Elements now sit in the `100-105` range.
    *   This ensures native overlays (z-index 1000+) correctly appear on top of the extension.

## Implementation Details

### Component Structure (`#ytm-ext-unified-art`)

```html
<div id="ytm-ext-unified-art">
  <div id="ytm-ext-art-wrapper" style="position: relative; display: inline-block;">
    <img id="ytm-ext-unified-art-img" alt="Album Art">
    <!-- top-row-buttons are anchored here to the top-right of the image -->
    <div class="unified-song-info">
      <div class="unified-song-title">Song Name</div>
      <div class="unified-song-artist">Artist Name</div>
    </div>
  </div>
</div>
```

### Key Changes

#### `styles.css`
*   **Static Typography**: Title is set to **18px** and Artist to **14px** across all modes.
*   **Artist Wrap**: Used `-webkit-line-clamp: 2` to allow artist names to wrap while maintaining centering.
*   **Flexbox Grouping**: `#ytm-ext-unified-art` uses `align-items: center; justify-content: center` to center the art. The text is absolutely positioned below it.
*   **Z-Index Fix**: Moved extension UI to lower z-index layers (`1-102`) so native search and menus work properly.

#### `content.js`
*   **Improved Extraction**: `getArtistName()` now reads the full subtitle and splits by the middle dot (`•`).
*   **Persistent Component**: `createUnifiedAlbumArt()` initializes the component once.
*   **JS-based Hiding**: `createFullscreenUI()` sets inline styles with `!important` and uses a `MutationObserver` to maintain the state.

## Verification

### 1. Multi-Artist Display
*   Verified that songs with multiple artists now show all names (e.g., "Artist A & Artist B") rather than just the first one.
*   Verified that album titles are correctly filtered out from the artist line.

### 2. Movement
*   Verified that when the sidebar collapses, the entire component shifts left/right and re-centers automatically.
*   Verified that entering/exiting fullscreen keeps the text perfectly static.

### 3. Visibility & Search
*   Verified that the player bar properly hides and reveals in fullscreen.
*   Verified that the native Search bar and results now appear **on top** of the extension UI.
