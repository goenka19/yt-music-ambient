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

2.  **Fullscreen Auto-Hide Player Bar**
    *   The player bar (controls) is hidden by default in fullscreen mode.
    *   Controls appear on mouse movement and auto-hide after 3 seconds of inactivity.
    *   **Verified Hiding**: Uses JS-based inline style setting + `MutationObserver` to ensure YouTube Music's native JS doesn't override our hiding logic.
    *   **Grace Period**: A 1-second grace period after entering fullscreen prevents the controls from appearing immediately due to the click that triggered it.

## Implementation Details

### Component Structure (`#ytm-ext-unified-art`)

```html
<div id="ytm-ext-unified-art">
  <div id="ytm-ext-art-wrapper" style="position: relative; display: inline-block;">
    <img id="ytm-ext-unified-art-img" alt="Album Art">
    <!-- top-row-buttons are anchored here to the top-right of the image -->
  </div>
  <div class="unified-song-info">
    <div class="unified-song-title">Song Name</div>
    <div class="unified-song-artist">Artist Name</div>
  </div>
</div>
```

### Key Changes

#### `styles.css`
*   **Static Typography**: Title is set to **18px** and Artist to **14px** across all modes. All `transition` and `scaling` rules have been removed to ensure a perfectly solid UI.
*   **Flexbox Grouping**: `#ytm-ext-unified-art` uses `flex-direction: column; align-items: center; justify-content: center` to center both the art and the text together.
*   **Anchored Buttons**: The `#ytm-ext-art-wrapper` uses `display: inline-block`, ensuring that absolute-positioned buttons (Shuffle, Repeat) remain attached to the top-right corner of the image, not the screen edge.

#### `content.js`
*   **Persistent Component**: `createUnifiedAlbumArt()` initializes the component once. The `#ytm-ext-art-wrapper` is set back to `inline-block` for correct button positioning.
*   **JS-based Hiding**: `createFullscreenUI()` sets `opacity: 0, translateY(100%)` via inline styles with `!important`.
*   **MutationObserver**: Watches `ytmusic-player-bar` for attribute changes to counter YouTube's attempts to reset the style.
*   **Unified Updates**: `updateUnifiedAlbumArt()` (runs every 2s) updates both the art URL and the text for the entire component.

## Verification

### 1. Movement
*   Verified that when the sidebar collapses, the entire component shifts left/right and re-centers automatically.
*   Verified that entering/exiting fullscreen keeps the text perfectly static (no scaling animation).

### 2. Button Placement
*   Verified that player buttons (Shuffle/Repeat) are correctly positioned relative to the album art (top-right), not floating at the edge of the screen.

### 3. Visibility
*   Verified that the player bar properly hides and reveals in fullscreen based on mouse activity.
