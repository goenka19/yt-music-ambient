# Plan: Apple Music–Style Animated Ambient Background

## Context

The current animated mode uses simple CSS `@keyframes drift1/2/3` (translate/scale drift). It's dead code — `animatedEnabled` defaults to `false` with no popup UI, so nobody ever sees it. The static mode (default) is untouched by this change.

**How Apple Music actually does it** (confirmed via reverse engineering at aadishv.dev/music):
- 4 copies of album art stacked at 25%, 50%, 80%, 125% of viewport
- Large layers (80%, 125%): spin in place only
- Small layers (25%, 50%): spin in place + orbit on a circular track
- Pixi.js filters: oversaturation + Twist shader + Kawase blur
- 15 FPS maximum
- Heavy blur bleeds all 4 spinning/orbiting copies into organic flowing color blobs

**Compute mitigation** (to stay below Apple Music's GPU budget):
- Canvas at half-resolution (50% px, CSS-stretched to fill) — blur makes lower-res invisible; cuts GPU work to 25%
- 15fps cap
- 40px blur (not 60px)
- Pause animation on `document.hidden`
- No SVG turbulence filter

**CORS confirmed safe:** `lh3.googleusercontent.com` returns `Access-Control-Allow-Origin: *`.

**Static mode is 100% untouched.** Canvas only activates when the new popup toggle is ON.

## Branch

`feature/apple-music-ambient` branched from `main`.

## Verified safe — nothing else breaks

- `ambientContainer.style.display` toggling (line 105): affects whole container; canvas is inside it — fine
- Slide-in animation (lines 220–233): applied to container class, canvas inherits it — fine
- Fullscreen z-index override (styles.css line 454): applied to `.ambient-container`; canvas is inside — fine
- `updateBackground` setting `.ambient-layer` backgroundImages even when hidden: harmless — static mode will use them correctly when toggled back

## Files to Modify

| File | Change |
|------|--------|
| `content.js` | Add canvas globals; modify `createAmbientBackground`, `updateBackground`, `applySettings`; add `startAmbientAnimation`, `stopAmbientAnimation`, `drawAmbientFrame`; update `destroyExtension` |
| `styles.css` | Remove drift keyframes (lines 39–69); add `.ambient-canvas` style |
| `popup.html` | Add animated background toggle section above the sleep timer section |
| `popup.js` | Wire checkbox to `chrome.storage.local` (`animatedEnabled` key) |

## Implementation Detail

### New globals (content.js ~line 8)
```javascript
let ambientCanvas = null;
let ambientAnimFrame = null;
let ambientImg = null;
let ambientLastFrame = 0;
```

### createAmbientBackground() (~line 123)
Keep the existing 3 div layers unchanged. Append one canvas after them:
```javascript
ambientCanvas = document.createElement('canvas');
ambientCanvas.className = 'ambient-canvas';
ambientContainer.appendChild(ambientCanvas);
```

### updateBackground(artUrl) (~line 141)
Add `img.crossOrigin = 'anonymous'` before `img.src = artUrl`.  
In the `img.onload` callback, add AFTER the existing layer backgroundImage update:
```javascript
ambientImg = img;
if (settings.animatedEnabled) startAmbientAnimation();
```

### applySettings() (~line 76–79)
After the existing `.classList.toggle('animated', settings.animatedEnabled)`, add:
```javascript
if (settings.animatedEnabled) {
  if (ambientImg) startAmbientAnimation();
} else {
  stopAmbientAnimation();
}
```

### startAmbientAnimation()
New function:
```javascript
function startAmbientAnimation() {
  if (!ambientCanvas || !ambientImg) return;
  cancelAnimationFrame(ambientAnimFrame);
  ambientCanvas.width = Math.floor(window.innerWidth / 2);
  ambientCanvas.height = Math.floor(window.innerHeight / 2);
  ambientLastFrame = 0;
  ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
}
```
Handlers (stored for cleanup — follow existing cleanup pattern):
- `document.addEventListener('visibilitychange', ...)` → if hidden, cancel RAF; if visible, restart
- `window.addEventListener('resize', ...)` → update canvas dimensions and restart

### stopAmbientAnimation()
New function:
```javascript
function stopAmbientAnimation() {
  cancelAnimationFrame(ambientAnimFrame);
  ambientAnimFrame = null;
}
```

### drawAmbientFrame(timestamp)
New function:
```javascript
function drawAmbientFrame(timestamp) {
  if (!ambientCanvas || !ambientImg || !settings.animatedEnabled) return;
  if (timestamp - ambientLastFrame < 66) {   // 15fps cap
    ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
    return;
  }
  ambientLastFrame = timestamp;
  const w = ambientCanvas.width, h = ambientCanvas.height;
  const cx = w / 2, cy = h / 2;
  const t = timestamp / 1000;
  const min = Math.min(w, h);
  const ctx = ambientCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const layers = [
    { scale: 1.25, rotPeriod: 60, orbitR: 0,          orbitPeriod: 0,  alpha: 0.9 },
    { scale: 0.80, rotPeriod: 45, orbitR: 0,          orbitPeriod: 0,  alpha: 0.8 },
    { scale: 0.50, rotPeriod: 30, orbitR: min * 0.18, orbitPeriod: 20, alpha: 0.7 },
    { scale: 0.25, rotPeriod: 20, orbitR: min * 0.25, orbitPeriod: 12, alpha: 0.6 },
  ];

  for (const layer of layers) {
    const lw = w * layer.scale, lh = h * layer.scale;
    const angle = (t / layer.rotPeriod) * Math.PI * 2;
    const ox = layer.orbitR * Math.cos((t / layer.orbitPeriod) * Math.PI * 2);
    const oy = layer.orbitR * Math.sin((t / layer.orbitPeriod) * Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.translate(cx + ox, cy + oy);
    ctx.rotate(angle);
    ctx.drawImage(ambientImg, -lw/2, -lh/2, lw, lh);
    ctx.restore();
  }
  ambientAnimFrame = requestAnimationFrame(drawAmbientFrame);
}
```

### destroyExtension() (~line 2605)
Add `stopAmbientAnimation();` in the cleanup block.

---

### styles.css

**Remove** lines 39–69 entirely (`.ambient-container.animated .layer-*` rules and all 3 drift `@keyframes`).

**Replace** with:
```css
/* Animated mode: hide div layers, show canvas */
.ambient-container.animated .ambient-layer {
  opacity: 0;
}

.ambient-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: none;
  filter: blur(40px) saturate(2.5) brightness(0.7);
}

.ambient-container.animated .ambient-canvas {
  display: block;
}
```

---

### popup.html

Add before the sleep timer section (i.e., before `<!-- Sleep Timer Section -->`):

```html
<!-- Animated Background Section -->
<div class="settings-section">
  <div class="setting-row">
    <span class="setting-label">Animated Background</span>
    <label class="toggle">
      <input type="checkbox" id="animated-bg-toggle">
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>
<div class="divider"></div>
```

This reuses the existing `.settings-section`, `.setting-row`, `.setting-label`, `.toggle`, `.toggle-slider` CSS already in popup.css — no new CSS needed.

---

### popup.js

At the top of `DOMContentLoaded`, add:
```javascript
const animatedBgToggle = document.getElementById('animated-bg-toggle');

chrome.storage.local.get(['animatedEnabled'], (data) => {
  animatedBgToggle.checked = data.animatedEnabled === true;
});

animatedBgToggle.addEventListener('change', () => {
  chrome.storage.local.set({ animatedEnabled: animatedBgToggle.checked });
});
```

---

## Edge Cases
1. **Song change while animated on** → `updateBackground` cancels old RAF via `startAmbientAnimation()` and starts fresh with new image
2. **Toggle on with no song playing** → `startAmbientAnimation` guarded by `if (ambientImg)` — starts on next image load
3. **Toggle off mid-animation** → `stopAmbientAnimation()` cancels RAF; CSS class removal hides canvas, shows div layers
4. **Window resize** → resize handler updates canvas px dimensions, restarts RAF
5. **Tab hidden** → visibilitychange handler cancels RAF; resumes on visible
6. **destroyExtension** → `stopAmbientAnimation()` cancels RAF before page unload

## Verification
1. Play a song on YouTube Music
2. Open popup → toggle "Animated Background" ON
3. Observe: 4 orbiting/spinning color blobs with Apple Music–style flowing motion
4. Check Activity Monitor → GPU History — should be low/moderate, not spiking
5. Toggle OFF → static blurred background returns instantly
6. Change song → background transitions to new art colors
7. Switch tab away + back → animation pauses, resumes cleanly
8. Reload extension → static mode still works exactly as before
