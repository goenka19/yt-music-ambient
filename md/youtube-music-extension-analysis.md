# YouTube Music Web Enhancement: Analysis

## 1. Top Complaints / Missing Features (Opportunity List)

| Feature Gap | Difficulty | Impact | Notes |
|-------------|------------|--------|-------|
| **Live/synced lyrics** | Medium | High | Web only has static lyrics; mobile has synced. Now paywalled (5 views for free users) |
| **No equalizer** | Medium | High | Desktop has zero EQ options; competitors have it |
| **Dynamic theme/background** | Easy | Medium | Mobile has it, web doesn't |
| **Mini player** | Easy | Medium | No proper PiP/mini player for multitasking |
| **Better keyboard shortcuts** | Easy | Medium | Limited shortcuts; no volume control via keyboard |
| **Visualizers** | Medium | Low-Med | Fun feature, differentiator |
| **Sleep timer** | Easy | Medium | Not on web |
| **Playlist organization** | Hard | High | Limited sorting, no pinning |
| **Hi-res audio indicator** | Easy | Low | Show current bitrate (128/256kbps) |
| **"Now Playing" queue improvements** | Medium | Medium | Queue management is clunky |
| **Crossfade between tracks** | Hard | Medium | Not available on web |

---

## 2. Existing Extensions (Competition)

| Extension | Rating | Features | Gap You Can Fill |
|-----------|--------|----------|------------------|
| **ThemeSong** | ~4.9★ Chrome | Dynamic themes, visualizers, sleep timer, "open in YouTube" | No equalizer, limited lyrics |
| **Better Lyrics** | Firefox | Synced lyrics, translations, click-to-seek | Single feature only |
| **BetterYTM** | GitHub | Plugin system, enhancements | More developer-focused |
| **Music Mode** | Chrome/FF | Hides video, saves bandwidth | Very narrow feature |
| **YTM-Plus** | GitHub | Mini player, lyrics, LastFM | Appears less maintained |

**Key insight:** No single extension does everything well. ThemeSong is closest to "complete" but lacks equalizer and has no real lyrics integration.

---

## 3. Technical Feasibility

### Easy Features

| Feature | How | Complexity |
|---------|-----|------------|
| **Synced lyrics** | Use Musixmatch API or scrape Genius | Medium - API rate limits apply |
| **Dynamic background** | Extract album art, apply blur/gradient via CSS | Easy |
| **Mini player** | Chrome's PiP API or custom floating div | Easy |
| **Sleep timer** | Simple setTimeout + pause | Easy |
| **Keyboard shortcuts** | Content script + event listeners | Easy |
| **Visualizer** | Web Audio API + Canvas | Medium |

### Medium Features

| Feature | How | Complexity |
|---------|-----|------------|
| **Equalizer** | Web Audio API's BiquadFilterNode | Medium - need to intercept audio |
| **Crossfade** | Dual audio contexts, blend on track change | Medium-Hard |
| **Better queue** | DOM manipulation, local state | Medium |

### Hard Features

| Feature | Challenge |
|---------|-----------|
| **Playlist organization** | Requires API calls Google doesn't expose publicly |
| **True hi-res audio** | Can't change what YouTube serves |
| **Offline mode** | Service workers + storage, but DRM issues |

---

## 4. Lyrics Implementation Options

| Source | Pros | Cons |
|--------|------|------|
| **Musixmatch API** | Official, synced lyrics, huge DB (14M+) | Free tier = 30% of lyrics only |
| **Reversed Musixmatch** | Full access, free | Grey area legally, rate limited |
| **Genius scraping** | Full lyrics, annotations | No sync timing, requires scraping |
| **LRCLIB** | Free, synced | Smaller database |

**Recommendation:** Use a fallback chain: LRCLIB → Musixmatch → Genius scrape

---

## 5. Technical Architecture

```
Content Script (injected into music.youtube.com)
├── DOM Observer (track changes, current song info)
├── Audio Interceptor (Web Audio API for EQ/visualizer)
├── UI Injector
│   ├── Lyrics panel
│   ├── Mini player
│   ├── Settings popup
│   └── Visualizer canvas
├── Lyrics Fetcher (background script)
│   └── API calls to Musixmatch/Genius
└── State Manager (current track, user prefs)
```

**Key challenge:** YouTube Music is an SPA. Use MutationObserver to detect track changes. WXT framework handles this well.

---

## 6. Recommended Feature Set for V2

### Tier 1 - Core (ship first)
1. Dynamic background (already built)
2. Synced lyrics panel with click-to-seek
3. Mini player (floating or PiP)
4. Enhanced keyboard shortcuts (volume, seek)
5. Sleep timer

### Tier 2 - Differentiation
6. Audio equalizer (5-10 band)
7. Multiple visualizer styles
8. "Open in YouTube" to see comments
9. Scrobbling (Last.fm integration)

### Tier 3 - Polish
10. Spotify-like share cards
11. Queue improvements
12. Cross-device sync of preferences

---

## 7. Monetization Potential

| Model | Viability |
|-------|-----------|
| **Free + donations** | Low revenue, good for growth |
| **Freemium** | Core free, advanced (EQ, visualizers) paid |
| **One-time purchase** | Works on Firefox; Chrome prefers subscriptions |
| **Sponsorship** | Newsletter/indie music sponsors |

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| **Google breaks your extension** | DOM changes can break selectors; use resilient selectors, maintain actively |
| **Chrome Web Store rejection** | Follow manifest V3 rules strictly |
| **Lyrics API costs/limits** | Use fallback chain, cache aggressively |
| **Competition from ThemeSong** | Focus on lyrics + equalizer (their weak spots) |

---

## 9. Recommended Tech Stack

- **Framework:** TypeScript + WXT (https://wxt.dev/)
- **Audio:** Web Audio API
- **Lyrics:** LRCLIB → Musixmatch → Genius fallback
- **State:** Chrome storage API for preferences

---

## 10. Key Resources

- ThemeSong GitHub: https://github.com/KristofferTroncoso/ThemeSong
- BetterYTM: https://github.com/Sv443/BetterYTM
- Better Lyrics: https://addons.mozilla.org/en-US/firefox/addon/better-lyrics/
- Musixmatch API: https://publicapis.io/musixmatch-api
- WXT Framework: https://wxt.dev/guide/essentials/content-scripts.html
- Reversed Musixmatch: https://github.com/Strvm/musicxmatch-api
- ytmusicapi (Python): https://github.com/sigma67/ytmusicapi

---

## Bottom Line

**Market need:** Yes - YouTube Music web is neglected vs mobile
**Competition:** Moderate - ThemeSong leads but has gaps
**Technical feasibility:** High - All features are buildable with Web APIs
**Unique angle:** Lyrics + Equalizer + background art = complete package no one else has
