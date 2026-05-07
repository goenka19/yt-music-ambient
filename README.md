# YouTube Music Ambient Background

A Chrome extension that brings Apple Music-style visual effects to YouTube Music — dynamic ambient backgrounds, synced lyrics, a mini player, sleep timer, and an equalizer.

## Features

- **Ambient background** — Album art blurred and saturated behind the player, updating with each song
- **Animated mode** — Three layered art images drift and scale for a living wallpaper effect
- **Synced lyrics** — Fetched from [LRCLIB](https://lrclib.net), current line highlighted, click any line to seek
- **Fullscreen mode** — Album art on the left, lyrics on the right, player bar auto-hides
- **Mini player** — Floating Document Picture-in-Picture window with artwork and playback controls
- **Sleep timer** — Auto-pause after 1 / 15 / 30 / 45 / 60 / 90 minutes
- **Sidebar toggle** — Collapse the Up Next panel for a cleaner view
- **Equalizer** _(in progress)_ — 5-band audio EQ with presets

## Installation

> Requires Chrome or any Chromium-based browser.

1. Download this repo (Code → Download ZIP) or clone it.
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the folder that contains `manifest.json` (the repo root)
6. Go to [music.youtube.com](https://music.youtube.com) and play a song

## Usage

| Action | How |
|--------|-----|
| Toggle settings | Click the extension icon |
| Toggle sidebar | `Shift + S` or the sidebar button |
| Open mini player | `P` key |
| Enter fullscreen | Click the fullscreen button on the player |
| Collapse sidebar in fullscreen | `]` key |

## Troubleshooting

- Changed code but nothing happens: open `chrome://extensions/` and click the **reload** icon on the extension card.
- `Open in YouTube` opens the wrong track: reload the extension (the button updates on song change via SPA URL updates).
- Lyrics not showing: YouTube Music’s DOM changes often; open DevTools and check the console for `[YTM-Ext` logs.

## Development

### Setup

```bash
git clone https://github.com/goenka19/yt-music-ambient.git
cd yt-music-ambient
```

Load the extension in Chrome as described in Installation.

### Reloading Changes

After editing `content.js` or `styles.css`, click the **refresh icon** on the extension card in `chrome://extensions/`. For `manifest.json` changes, remove and re-add the extension.

### Launch Chrome with Remote Debugging

```bash
./launch-chrome.sh
```

Opens a clean Chrome profile with the extension loaded and remote debugging on port 9222 (useful for Playwright or CDP-based testing).

## External APIs

| Service | Used For | Auth |
|---------|----------|------|
| [LRCLIB](https://lrclib.net) | Synced lyrics | None — free, no key required |

## License

[MIT](LICENSE)
