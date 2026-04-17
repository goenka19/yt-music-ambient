# CLAUDE.md

## ⛔ MANDATORY BEFORE EVERY RESPONSE ⛔

**YOU MUST DO THIS BEFORE ANY ACTION:**

1. Re-read this file (CLAUDE.md) completely
2. Re-read INSTRUCTIONS.md completely
3. For ANY non-trivial task, list edge cases BEFORE coding
4. Enter plan mode for any task with 3+ steps
5. DO NOT write code until you have a plan approved by the user

**IF YOU SKIP THIS:**
- The user will terminate the session
- Your work will be rejected
- You are failing at your job

**AFTER EVERY FAILED ATTEMPT:**
- STOP immediately
- Re-read this file
- Identify what rule you violated
- Re-plan before trying again

---

## ⛔ CRITICAL LESSONS FROM PAST MISTAKES ⛔

### Browser API Features
**NEVER claim a browser feature works without verifying:**
1. Check the user's actual browser version
2. Verify if experimental flags are required
3. Test in stable Chrome, not beta/canary
4. If documentation says "Chrome 134+" - that's EXPERIMENTAL, not available to most users

**Example failure:** Auto PiP requires Chrome 137+ (not released) or Chrome 134+ with flags. I claimed it would work without verifying. It didn't.

### When Researching Solutions
1. Documentation saying "available" ≠ "works in stable Chrome"
2. Always ask: "What Chrome version is required? Is it stable or beta?"
3. If a feature requires flags, say so UPFRONT before implementing
4. Don't waste tokens on solutions that won't work for the user

### Debugging DOM/CSS Issues
**NEVER guess selectors or pixel values. ALWAYS verify with diagnostics FIRST.**
1. Before writing any positioning/selector code, add a SINGLE comprehensive `console.log` that checks ALL candidate selectors and ALL bounding rect values in ONE pass
2. NEVER assume a CSS selector from `styles.css` will work in `querySelector()` — the element may not exist, may be in shadow DOM, or may have changed
3. NEVER assume `getBoundingClientRect()` returns what you expect — always log the actual values before writing positioning logic
4. When debugging, check ALL possible failure points in ONE diagnostic pass, not one at a time across multiple iterations
5. Each round-trip to the user costs ~$5+ in tokens. Minimize iterations ruthlessly.

6. NEVER trust `getBoundingClientRect()` changes on wrapper elements as proof the visual content moved. YouTube uses nested positioned elements (e.g., `#movie_player` inside `#song-media-window`) -- the wrapper rect can shift while the inner element stays put. Always test on the innermost visual element.
7. For video positioning: the visible video is `#movie_player`, NOT `#song-media-window`. Target `#movie_player` directly.

**Example failure 1:** Spent ~$75 and 2 sessions trying to position a toggle by guessing CSS values, then using wrong selectors (`ytmusic-header-renderer` didn't exist, `ytmusic-player video` bounding rect didn't match visible area). Should have logged all candidate selectors and their bounding rects in one diagnostic from the start.

**Example failure 2:** Diagnostic confirmed `margin-top` on `#song-media-window` moved its rect by 12px. Shipped the fix. It didn't visually move the video because the actual video is rendered by `#movie_player` (a child with independent positioning). Should have tested on `#movie_player` directly or asked user to visually confirm.

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Orchestration (TOP PRIORITY)

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Code Quality

- No unused variables/imports - delete immediately
- No commented-out code - git has history
- Read existing code before modifying
- Handle null/undefined explicitly

## Verification Rules

- **ALWAYS test extension before saying "fixed"** - reload in chrome://extensions/, verify on music.youtube.com
- If you cannot test, say: "Change made but cannot verify - please test"
- If a simple task becomes complicated (>3 steps for something simple), STOP and ask

## Git Workflow

- Commit format: `type: description` (feat, fix, refactor, test, docs, chore)
- Don't push unless explicitly asked

## Multi-Model Delegation (OpenCode/DeepSeek)

For simple, mechanical tasks, delegate to OpenCode with DeepSeek Lite.

**Safe to delegate:**
- Single-file CSS/JS tweaks with clear verification
- Adding event listeners following existing patterns
- Renaming, adding comments, manifest changes
- Boilerplate following existing code patterns

**Keep in Claude Code:**
- Planning, architecture, new feature design
- Debugging, performance, "why doesn't this work"
- API integrations, complex logic
- Anything ambiguous

**Task Template for DeepSeek:**
```markdown
## Task: [Clear one-line description]

### File to Edit
`path/to/file.js` (lines X-Y)

### Current Code
[paste exact code to change]

### Change Required
[Explicit instruction - what to change, not why]

### Verification
1. Reload extension in chrome://extensions/
2. Go to music.youtube.com
3. [Specific thing to check]

### Do NOT
- Change any other code
- Add new features
- Refactor surrounding code
```

---

## Project Overview

YouTube Music Ambient Background is a Chrome Web Extension (Manifest V3) that adds Apple Music-style ambient background effects to YouTube Music. The extension extracts album art and displays it as a blurred, saturated background that dynamically changes with each song.

## Development Commands

**This project has no build system** - files are used directly without compilation.

### Loading the Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
4. Navigate to `music.youtube.com` to test

### Reloading Changes
- After editing `content.js` or `styles.css`, click the refresh icon on the extension card in `chrome://extensions/`
- For `manifest.json` changes, remove and re-add the extension

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                YouTube Music Web Page                    │
├─────────────────────────────────────────────────────────┤
│  content.js                                              │
│  ├─ MutationObserver (detects song changes)             │
│  ├─ Album Art Extraction (8 fallback selectors)         │
│  ├─ Background Renderer (creates ambient-bg div)        │
│  └─ Polling fallback (2s interval)                      │
├─────────────────────────────────────────────────────────┤
│  styles.css                                              │
│  ├─ .ambient-bg (blur, saturate, scale effects)         │
│  └─ UI overrides (transparent backgrounds, overlays)    │
└─────────────────────────────────────────────────────────┘
```

## Key Files

- **manifest.json**: Extension config (Manifest V3), declares content scripts for `music.youtube.com`
- **content.js**: Core engine - extracts album art, creates ambient background div, handles change detection via MutationObserver + polling
- **styles.css**: Visual effects (80px blur, 1.3x saturation, 0.5x brightness) and YouTube Music component overrides

## Code Patterns

### IIFE Wrapper
The entire `content.js` is wrapped in an IIFE `(function() { ... })()` for scope isolation.

### Selector Resilience
Album art extraction uses 8 fallback CSS selectors to handle different YouTube Music UI states:
```javascript
const selectors = [
    'ytmusic-player-bar img.image',
    // ... 7 more fallbacks
];
```

### Debounced Updates
MutationObserver events are debounced with 100ms delay to prevent excessive DOM updates.

### Image Preloading
New album art is preloaded via `new Image()` before updating the background to ensure smooth transitions.

## Important Notes

- All CSS overrides use `!important` to ensure they take precedence over YouTube's styles
- Album art URLs are upgraded from `w60-h60` to `w544-h544` resolution
- The ambient background uses `z-index: -1` to stay behind all content
- YouTube Music uses custom elements (`ytmusic-*`), so selectors target these specifically

---

## V2 Roadmap & Expanded Scope

### Strategic Context
YouTube Music web is neglected compared to mobile. ThemeSong is the main competitor but lacks equalizer and proper lyrics integration. Our unique angle: **Lyrics + Equalizer + Dynamic Background = complete package no one else has**.

### Feature Tiers

**Tier 1 - Core (ship first)**
1. ✅ Dynamic background (already built)
2. Synced lyrics panel with click-to-seek
3. Mini player (floating or PiP)
4. Enhanced keyboard shortcuts (volume, seek)
5. Sleep timer

**Tier 2 - Differentiation**
6. Audio equalizer (5-10 band)
7. Multiple visualizer styles
8. "Open in YouTube" to see comments
9. Last.fm scrobbling

**Tier 3 - Polish**
10. Spotify-like share cards
11. Queue improvements
12. Cross-device sync of preferences

### Target Architecture (V2)

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
│   └── API calls to LRCLIB/Musixmatch/Genius
└── State Manager (current track, user prefs)
```

### Technical Decisions

| Feature | Implementation |
|---------|----------------|
| **Synced lyrics** | Fallback chain: LRCLIB → Musixmatch → Genius scrape |
| **Equalizer** | Web Audio API's BiquadFilterNode (intercept audio element) |
| **Mini player** | Chrome's PiP API or custom floating div |
| **Visualizer** | Web Audio API + Canvas |
| **Sleep timer** | setTimeout + pause |
| **Keyboard shortcuts** | Content script + event listeners |

### Recommended Tech Stack (V2 Migration)
- **Framework:** TypeScript + WXT (https://wxt.dev/)
- **Audio:** Web Audio API
- **State:** Chrome storage API for preferences

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Google breaks selectors | Use resilient selectors with fallbacks, maintain actively |
| Chrome Web Store rejection | Follow Manifest V3 rules strictly |
| Lyrics API costs/limits | Use fallback chain, cache aggressively |
| Competition from ThemeSong | Focus on lyrics + equalizer (their weak spots) |

### Key Resources
- WXT Framework: https://wxt.dev/
- ThemeSong (competitor): https://github.com/KristofferTroncoso/ThemeSong
- BetterYTM: https://github.com/Sv443/BetterYTM
- LRCLIB (free synced lyrics): lrclib.net
- Reversed Musixmatch: https://github.com/Strvm/musicxmatch-api

---

## Browser Testing (Playwright MCP)

### Setup
- **Playwright MCP** is configured in `~/.config/opencode/opencode.json` (global config)
- Connects to Chrome via CDP at `ws://localhost:9222`
- MCP tools available: `browser_navigate`, `browser_snapshot`, `browser_screenshot`, etc.

### Launch Chrome for Testing
Before testing, launch Chrome with our extension loaded:
```bash
cd /Users/ujjwalgoenka/Desktop/Programming/yt-music-ext
./launch-chrome.sh
```
This opens Chrome with:
- Our extension auto-loaded
- Remote debugging on port 9222
- Clean profile at `/tmp/yt-music-ext-chrome-profile`

### Important Session Context
- **Session summary**: `SESSION.md` - comprehensive context for continuing work
- **Equalizer plan**: `tasks/equalizer-plan.md` - full implementation plan
- **Previous research**: Equalizer feasibility verified, architecture designed, ready for implementation
- **Branch**: `feature/equalizer` - all work happens here until merged
