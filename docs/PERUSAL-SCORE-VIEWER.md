# Perusal Score Viewer — Initialization, Gating & Reveal Systems

This document explains how the perusal score viewer loads, the three independent
systems that control its visibility, how they interact, what can go wrong, and
how to test for regressions.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Three Visibility Systems](#the-three-visibility-systems)
3. [Script Execution Order](#script-execution-order)
4. [The Double-Init Problem](#the-double-init-problem)
5. [Mode Preference and Device Constraints](#mode-preference-and-device-constraints)
6. [The `layoutSyncToken` Pattern](#the-layoutsynctoken-pattern)
7. [Critical Guards and Why They Exist](#critical-guards-and-why-they-exist)
8. [Debug Logging](#debug-logging)
9. [Things to Avoid](#things-to-avoid)
10. [Test Scenarios](#test-scenarios)
11. [How to Test (Production Build + Mobile Emulation)](#how-to-test)
12. [Key Files](#key-files)

---

## Architecture Overview

The perusal score viewer displays sheet music as a paginated, optionally
page-flippable image viewer. Three independent systems coordinate to control
when and how the viewer becomes visible to the user:

```
┌─────────────────────────────────────────────────────┐
│  perusal-score.astro (page component)               │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  1. Gating   │  │  2. Reveal   │  │ 3. Viewer  │ │
│  │  System      │  │  System      │  │ Ready      │ │
│  │              │  │              │  │ System     │ │
│  │  visibility: │  │  CSS         │  │            │ │
│  │  hidden      │  │  opacity: 0  │  │ inline     │ │
│  │              │  │              │  │ opacity    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│  perusal-gate.ts   inline <script>   PerusalScore   │
│                    (is:inline)       Viewer.astro    │
└─────────────────────────────────────────────────────┘
```

All three must resolve for the viewer to be visible. They resolve in this
order: Gating (token verified) -> Viewer Ready (images loaded, mode set) ->
Reveal (loading UI dismissed).

---

## The Three Visibility Systems

### 1. Gating System (`perusal-gate.ts`)

**Purpose:** Hide the score while the access token is verified.

**Mechanism:** CSS rules in `perusal-score.astro` apply `visibility: hidden` to
`.perusal-score-viewer-area` based on `data-perusal-gate-state`:

```css
[data-perusal-page][data-perusal-gating-enabled='true']:not([data-perusal-gate-state])
  .perusal-score-viewer-area,
[data-perusal-page][data-perusal-gating-enabled='true'][data-perusal-gate-state='locked']
  .perusal-score-viewer-area {
  visibility: hidden;
  pointer-events: none;
}
```

**Flow:**
1. Page loads with no `data-perusal-gate-state` attribute (CSS hides viewer)
2. `perusal-gate.ts` sets `data-perusal-gate-state='locked'` (still hidden)
3. Token verification runs (API endpoint first, then Web Crypto fallback)
4. On success: sets `data-perusal-gate-state='unlocked'`, dispatches
   `perusal-gate-revealed` custom event
5. On failure: redirects to request-score-access page

**Why `visibility: hidden` and not `display: none` or `opacity: 0`:**
- `visibility: hidden` preserves layout dimensions (needed for size calculations)
- `display: none` breaks layout-dependent reveal animations
- `opacity: 0` would let page-flip initialize in a "visible" container, producing
  transparent/broken pages

### 2. Reveal System (inline `<script is:inline>` in `perusal-score.astro`)

**Purpose:** Show a loading progress UI, then smoothly transition to the score.

**Mechanism:** CSS rules target `data-perusal-reveal-state` on the page element:

```css
.perusal-score-page[data-perusal-reveal-enabled='true'][data-perusal-reveal-state='loading']
  .score-viewer {
  opacity: 0;
  pointer-events: none;
}
```

**Flow:**
1. Inline script sets `data-perusal-reveal-enabled='true'` (state defaults to
   `'loading'` via CSS attribute selectors)
2. Listens for `perusal-score-viewer-ready` event from the viewer
3. When received: runs a loading progress catch-up animation, then calls
   `reveal()` after a 160ms delay
4. `reveal()` sets `data-perusal-reveal-state='ready'`, removing the CSS
   `opacity: 0` rule
5. Has a 30-second timeout fallback

**Key detail:** This is an `is:inline` script (non-module), so it runs
synchronously when the HTML parser encounters it, before any module scripts.

### 3. Viewer Ready System (`PerusalScoreViewer.astro`)

**Purpose:** Keep the viewer hidden until images are loaded and the correct
display mode (spread or page-flip) is initialized.

**Mechanism:** Inline `opacity` style on the `.score-viewer` element at init,
then coordinated handoff to the reveal system's CSS transition.

```typescript
// At init (line ~920):
if (viewer.dataset.scoreReady !== 'true') {
  viewer.style.opacity = '0'
}
```

**Flow (with reveal system active — the normal case on perusal score pages):**
1. `initScoreViewer()` sets `viewer.style.opacity = '0'` (unless already ready)
2. `syncViewerMode()` determines the correct mode (spread or page-flip)
3. Images preload, mode initializes
4. `announceReady()` fires: sets `data-score-ready='true'`, then:
   - **Removes** the inline `opacity: 0` (the CSS rule still hides the viewer)
   - Pre-applies `transition: opacity 400ms ease`
   - Dispatches `perusal-score-viewer-ready` event (consumed by reveal system)
5. Reveal system receives the event, runs catch-up animation, then sets
   `data-perusal-reveal-state='ready'`
6. CSS `opacity: 0` rule stops matching → the pre-applied transition smoothly
   fades the viewer from 0 to 1 over 400ms
7. `onRevealComplete` cleans up the inline transition after the fade finishes

**Flow (without reveal system — fallback for non-perusal-score contexts):**
1. Same init: `viewer.style.opacity = '0'`
2. Same mode setup and image preloading
3. `announceReady()` fires with `revealPending=false`:
   - After 100ms settle: sets `transition: opacity 150ms ease` + `opacity: 1`
   - Cleans up both inline properties after the crossfade

**Critical: the inline opacity / CSS opacity interaction**

The init sets `viewer.style.opacity = '0'` (inline). The reveal system's CSS
rule also sets `opacity: 0` (via `reveal-state='loading'`). When `announceReady()`
fires with the reveal still pending, it **must remove the inline opacity** before
the CSS rule is removed. Otherwise, the inline `0` overrides the CSS cascade and
the CSS transition has no effect — the viewer stays invisible permanently.

This is safe because the CSS rule is still active at the time `announceReady()`
removes the inline style, so the viewer remains hidden. The sequence is:

```
1. announceReady():  remove inline opacity:0  (CSS rule still hides viewer)
2. announceReady():  apply transition          (viewer still hidden by CSS)
3. reveal():         set state='ready'         (CSS rule drops → transition fires)
4. Browser:          animate opacity 0 → 1     (400ms fade-in)
```

If the inline opacity is NOT removed, step 3 has no visible effect because
inline styles always override the CSS cascade.

---

## Script Execution Order

In the **production build**, Astro bundles component scripts into separate
module chunks. The execution order matters critically:

```
1. Inline reveal script     (is:inline, non-module — runs first during parsing)
2. Dropdown.astro            (module — runs in DOM order)
3. PerusalScoreViewer.astro  (module — runs BEFORE page scripts)
4. perusal-score.astro [0]   (module — dispatches view mode correction)
5. perusal-score.astro [1]   (module — audio player)
6. perusal-score.astro [2]   (module — perusal-gate.ts)
```

**Critical implication:** Script 4 dispatches the `perusal-score-view-mode-change`
event that corrects `modePreference` from the dropdown's default `'spreads'` to
`'auto'` on portrait devices. But script 3 (PerusalScoreViewer) has already
read the dropdown value and started initialization.

This means the mode-change event arrives **after** the viewer has already read
`modePreference` from the dropdown DOM. The `isSinglePageDeviceContext()` guards
in `shouldUseFlipMode()` and `getSpreadSizeForCurrentViewport()` protect against
this by checking device constraints *before* honoring `modePreference === 'spreads'`.

---

## The Double-Init Problem

Astro wraps component `<script>` blocks to re-execute on `astro:page-load` for
View Transition support. On a full page load (no View Transition), this means:

1. **First init:** Module script runs when parsed by the browser
2. **Second init:** `astro:page-load` fires, re-runs `initAllScoreViewers()`

Both `PerusalScoreViewer.astro` and `perusal-gate.ts` must handle this gracefully.

### PerusalScoreViewer — the early-return guard

The first line of defense is a complete early return at the top of
`initScoreViewer()`:

```typescript
if (viewer.dataset.scoreReady === 'true' && viewerCleanups.has(viewer)) {
  return  // skip re-init entirely
}
```

If the viewer is already initialized and has an active cleanup registered, the
second init is skipped entirely. This prevents:

1. **Page-flip destruction flash:** The cleanup would destroy the page-flip
   instance, briefly exposing the underlying spread layout (pages 1-2 side by
   side) until a new page-flip instance is created ~20ms later.
2. **Redundant work:** All event listeners, state, and the page-flip instance
   from the first init are still valid on a full page load.

On a View Transition swap, the new DOM element will have `scoreReady='false'`
and no registered cleanup, so this guard won't fire and full initialization
proceeds normally.

### PerusalScoreViewer — the opacity guard (defense-in-depth)

If the early return is somehow bypassed, the opacity guard prevents the viewer
from being blanked:

```typescript
if (viewer.dataset.scoreReady !== 'true') {
  viewer.style.opacity = '0'
}
```

Without this guard, a re-init would blank the viewer (`opacity = '0'`), but
`announceReady()` would skip (because `data-score-ready` is already `'true'`),
leaving the viewer permanently invisible with no code path to restore it.

### perusal-gate.ts — the `perusalGateInitStarted` flag

```typescript
if (page.dataset.perusalGateInitStarted === 'true') {
  return () => {}  // skip duplicate init
}
page.dataset.perusalGateInitStarted = 'true'
```

This uses a data attribute rather than checking `gateState === 'unlocked'`
because with network throttling the async token verification may still be
in-flight (`gateState` still `'locked'`) when `astro:page-load` fires. A second
run would start a redundant lock/verify/unlock cycle, or worse, re-lock a gate
that the first run already unlocked.

---

## Mode Preference and Device Constraints

The viewer has three mode preferences: `'auto'`, `'spreads'`, `'single'`.

The dropdown in the page defaults to `'spreads'` in its HTML. On portrait/mobile
devices, `perusal-score.astro` dispatches a `perusal-score-view-mode-change`
event to correct this to `'auto'`. But due to production script execution order,
this event may arrive **after** the viewer has already initialized.

**The fix:** `shouldUseFlipMode()` and `getSpreadSizeForCurrentViewport()` check
`isSinglePageDeviceContext()` (portrait orientation) **before** checking
`modePreference === 'spreads'`:

```typescript
function shouldUseFlipMode(): boolean {
  if (!flipAnimationEnabled) return false
  if (useStaticSpreadOnly) return false
  if (prefersReducedMotion.matches) return false
  if (modePreference === 'single') return false
  if (isSinglePageDeviceContext()) return false  // <-- before 'spreads' check
  if (modePreference === 'spreads') return true
  return wideViewport.matches
}
```

This ensures portrait devices never attempt flip mode, regardless of what
`modePreference` is set to.

---

## The `layoutSyncToken` Pattern

`syncViewerMode()` is async (page-flip initialization involves image preloading).
During the async gap, viewport events or mode changes can fire. The
`layoutSyncToken` pattern prevents stale operations from completing:

```typescript
const syncToken = ++layoutSyncToken

// ... async work (preloading, crossfade) ...

if (syncToken !== layoutSyncToken) {
  // A newer syncViewerMode() call has started — abort this one
  return
}
```

**Risk:** If an aborted `syncViewerMode()` was the one that would have called
`announceReady()`, and no subsequent call reaches it, the viewer stays invisible.
The device-constraint guards minimize this by preventing flip-mode attempts that
would be aborted anyway.

---

## Critical Guards and Why They Exist

| Guard | Location | Protects Against |
|---|---|---|
| `scoreReady === 'true' && viewerCleanups.has(viewer)` early return | initScoreViewer top | Teardown flash: page-flip destroyed, spread layout briefly visible |
| `viewer.dataset.scoreReady !== 'true'` before `opacity = '0'` | initScoreViewer ~line 920 | Defense-in-depth: double-init blanking a visible viewer |
| `removeProperty('opacity')` in reveal-pending announceReady | announceReady | Inline `opacity:0` overriding CSS cascade, blocking the reveal fade-in transition |
| `page.dataset.perusalGateInitStarted` | perusal-gate.ts ~line 425 | Double-init of gate during async verification |
| `isGatingActive()` in `syncViewerMode()` | PerusalScoreViewer ~line 1134 | Page-flip init while `visibility: hidden` |
| `isRevealPending()` branch in announceReady | announceReady | Desynchronized fade: viewer fading in before loading overlay disappears |
| `isSinglePageDeviceContext()` before `modePreference === 'spreads'` | shouldUseFlipMode + getSpreadSizeForCurrentViewport | Portrait device forced into flip mode by stale modePreference |
| `revealObserver` disconnect in cleanup | viewerCleanups callback | MutationObserver leak across re-init cycles |
| `hasRevealed` guard in `reveal()` | inline reveal script | Double-fire of the one-shot reveal system |

---

## Debug Logging

Both files include `console.debug` statements prefixed with `[PSV]` (viewer) or
`[Gate]` (gate). The viewer uses a per-instance timer:

```
[PSV +0ms]   — relative to initScoreViewer() entry
[PSV +142ms] — 142ms after init started
[Gate]       — gate events (no timer, these are singletons)
```

**Keep this logging active in production** until the system has been stable for
an extended period. The debug level is stripped by most browser consoles unless
"Verbose" or "All levels" is enabled, so it has no user-visible impact.

### Expected healthy log sequence (gated score, mobile portrait)

```
[PSV] readyState=interactive → initAllScoreViewers (immediate)
[PSV +0ms] initScoreViewer: viewer found
[PSV +1ms] init: calling syncViewerMode()
[PSV +1ms] syncViewerMode: gating active, deferring
[Gate] token found, starting verification
[Gate] lockScore: setting gateState=locked
[Gate] verification result: { valid: true, ... }
[Gate] revealScore: setting gateState=unlocked, dispatching perusal-gate-revealed
[PSV +Nms] onGateRevealed: ...
[PSV +Nms] syncViewerMode: running { shouldFlip: false, spreadSize: 1, ... }
[PSV +Nms] syncViewerMode: → spread mode
[PSV +Nms] announceReady: scoreReady=true, opacity:1 in 100ms
[PSV] astro:page-load → initAllScoreViewers
[PSV] initScoreViewer called { hasExistingCleanup: true, scoreReady: 'true', ... }
[PSV] initScoreViewer: already initialized with active cleanup, skipping re-init
[Gate] astro:page-load → initPerusalGate()
[Gate] initPerusalScorePage: already started, skipping duplicate init
```

Key things to check in the logs:
- **`syncViewerMode: gating active, deferring`** must appear on first init when
  gating is enabled
- **`already initialized with active cleanup, skipping re-init`** should appear
  on the second init (from `astro:page-load`), confirming the viewer is not
  torn down and rebuilt
- **`already started, skipping duplicate init`** should appear for the gate's
  second init
- **`shouldFlip: false`** on portrait/mobile devices, regardless of
  `modePreference`

---

## Things to Avoid

### Never do these

1. **Do not remove the early-return guard at the top of `initScoreViewer()`.** It
   prevents the `astro:page-load` re-init from tearing down a working page-flip
   instance, which causes a visible flash of the spread layout.

2. **Do not call `syncViewerMode()` or `enableFlipMode()` before the gate resolves.**
   The `isGatingActive()` guard in `syncViewerMode()` prevents this. Do not
   bypass or remove it.

3. **Do not remove the `scoreReady` guard before the opacity blanking.** This is
   defense-in-depth: if the early return is bypassed, the opacity guard prevents
   the viewer from being blanked with no recovery path.

4. **Do not remove the `perusalGateInitStarted` flag.** Checking
   `gateState === 'unlocked'` is insufficient because the async verification
   may still be in-flight.

5. **Do not move `isSinglePageDeviceContext()` after `modePreference === 'spreads'`
   in `shouldUseFlipMode()` or `getSpreadSizeForCurrentViewport()`.** Portrait
   devices must never use flip mode or double-spread, regardless of mode preference.

6. **Do not replace gating CSS (`visibility: hidden`) with `display: none` or
   `opacity: 0`.** See the gating system section for why.

7. **Do not navigate to perusal score pages using Astro View Transitions (soft
   navigation).** The page uses `PerusalLayout` with `data-astro-reload`. Soft
   transitions cause stale DOM state and break page-flip initialization. All
   links to `/perusal-score/` URLs must use `data-astro-reload` or
   `window.location`.

8. **Do not add CSS `transition` on `.score-viewer` `opacity`.** This was
   previously present (`transition: opacity 1500ms ease`) and amplified race
   conditions into visible 1500ms fade-outs. Inline transitions are applied
   only when needed (crossfade) and removed immediately after.

9. **Do not remove or weaken the `layoutSyncToken` abort checks.** They prevent
   stale async operations from completing after a newer sync has started.

10. **Do not reset `data-score-ready` in the cleanup callback.** The cleanup runs
    before re-init on `astro:page-load`. If `scoreReady` were reset, the
    early-return guard and opacity guard would both fail.

### Be careful with these

- **Adding new callers to `syncViewerMode()`** — all callers are protected by the
  `isGatingActive()` guard inside the function. If you add a code path that
  skips `syncViewerMode()` and calls `enableFlipMode()` directly, you must add
  your own gating check.

- **Changing the mode dropdown default value** — the production script execution
  order means the viewer reads the dropdown before the page script corrects it.
  The `isSinglePageDeviceContext()` guards compensate, but changing the default
  could affect other edge cases.

- **Modifying the reveal system timing** — the 160ms delay before `reveal()` and
  the 100ms settle delay before `opacity = '1'` in `announceReady()` are
  calibrated to avoid flashes. The reveal's 250ms cleanup (removing inline
  opacity) must not race with the viewer's fade-in.

---

## Test Scenarios

### Required test matrix

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Mobile portrait, gated, Fast 4G throttling | Score loads and stays visible |
| 2 | Mobile portrait, gated, Slow 3G throttling | Score loads (slower) and stays visible |
| 3 | Mobile portrait, ungated | Score loads immediately, no gating delay |
| 4 | Desktop wide viewport, gated | Flip mode with double-spread works |
| 5 | Desktop wide viewport, ungated | Flip mode with double-spread works |
| 6 | Desktop, dropdown change (auto -> spreads -> single) | Crossfade transitions smoothly |
| 7 | Desktop, resize from wide to narrow | Mode switches from flip to spread gracefully |
| 8 | Mobile, `prefers-reduced-motion: reduce` | No flip mode, single-page spread only |
| 9 | Production build (`npm run build && npm run preview`) | All above scenarios work identically to dev |

### What to look for

- **Viewer is visible** (not stuck at `opacity: 0` or `visibility: hidden`)
- **Correct mode** (portrait devices: single-page spread, wide desktops: flip or
  double-spread)
- **No flash** of spread-mode pages before page-flip initializes
- **Console logs** show the expected sequence (see Debug Logging section)
- **No duplicate gate init** (`already started, skipping` appears on second init)
- **No double `announceReady`** (`already ready, skipping` appears on second init)

---

## How to Test

### Production build testing (the most important test)

Many bugs in this system only manifest in the production build because Astro
bundles scripts differently than dev mode (separate module chunks with different
execution order). **Always test with the production build.**

```bash
npm run build && npm run preview
```

This serves the production build on `http://localhost:4321`.

### Mobile touch device emulation with network throttling

This is the exact reproduction scenario for the bugs this system is hardened
against. Use Chrome DevTools:

1. **Build and preview:** `npm run build && npm run preview`

2. **Open Chrome DevTools** (F12 or Cmd+Option+I)

3. **Enable device emulation:**
   - Click the device toolbar toggle (phone/tablet icon, or Cmd+Shift+M)
   - Select a mobile device or set a custom viewport (e.g., 672px wide)
   - The device must report as **portrait orientation** to trigger
     `isSinglePageDeviceContext()`

4. **Enable touch emulation:**
   - In the device toolbar, ensure the device type shows a touch-capable device
   - Or manually: DevTools > More tools > Sensors > Touch: "Force enabled"
   - This is important because `(pointer: coarse)` affects some code paths

5. **Enable network throttling:**
   - In the Network tab, select "Fast 4G" or "Slow 3G" from the throttling dropdown
   - "Slow 3G" is the harshest test — it extends async operations enough to
     trigger token invalidation races
   - **Important:** The throttling must be active *before* navigating to the page

6. **Navigate to a gated perusal score page:**
   - Navigate to `http://localhost:4321/music/<slug>/perusal-score/?token=<valid-token>`
   - Or navigate to a score page where you have a stored token in localStorage

7. **Open the console** (Console tab) and set the level filter to include
   "Verbose" / "Debug" to see the `[PSV]` and `[Gate]` debug messages

8. **Verify:**
   - The score viewer becomes visible and stays visible
   - The console log sequence matches the expected healthy sequence
   - No `opacity: 0` is left on the viewer after initialization completes
   - `shouldFlip: false` appears in the syncViewerMode log for portrait devices
   - The gate's second init is skipped (`already started, skipping`)

9. **Repeat with a hard reload** (Cmd+Shift+R) to test the full flow again

### Desktop testing

1. Same production build and preview
2. Use a wide viewport (1280px+, landscape)
3. Navigate to a perusal score page
4. Verify flip mode works (page-turning animation on click)
5. Change the mode dropdown: auto -> spreads -> single -> auto
6. Each change should crossfade smoothly (no flicker, no stuck states)
7. Resize the browser window from wide to narrow — mode should switch

### Quick smoke test checklist

- [ ] Production build (`npm run build`) completes without errors
- [ ] Mobile portrait + Fast 4G: score visible and stable
- [ ] Mobile portrait + Slow 3G: score visible and stable
- [ ] Desktop wide: flip mode works
- [ ] Desktop dropdown changes: crossfade works
- [ ] Console shows expected log sequence (no unexpected errors)
- [ ] No `[PSV] syncViewerMode: gating active, deferring` log appears *after*
      the gate has already unlocked (would indicate a state inconsistency)

---

## Key Files

| File | Role |
|------|------|
| `src/components/PerusalScoreViewer.astro` | Main viewer component — mode switching, fade transitions, initialization, all three visibility system interactions |
| `src/scripts/perusal-gate.ts` | Token verification, gate lock/unlock, dispatches `perusal-gate-revealed` |
| `src/pages/music/[work]/perusal-score.astro` | Page component — gating CSS rules, inline reveal script, mode correction dispatch |
| `src/utils/perusal-gate-shared.ts` | Shared utilities for token handling (used by both gate and request-access pages) |

### Custom events

| Event | Dispatched by | Listened by | Purpose |
|-------|---------------|-------------|---------|
| `perusal-gate-revealed` | `perusal-gate.ts` | `PerusalScoreViewer.astro` | Gate unlocked, safe to init page-flip |
| `perusal-score-viewer-ready` | `PerusalScoreViewer.astro` | Inline reveal script | Viewer initialized, start reveal animation |
| `perusal-score-loading-progress` | `PerusalScoreViewer.astro` | Inline reveal script | Image preload progress for loading UI |
| `perusal-score-view-mode-change` | `perusal-score.astro` | `PerusalScoreViewer.astro` | Mode preference changed (dropdown or viewport correction) |

### Data attributes

| Attribute | Element | Values | Purpose |
|-----------|---------|--------|---------|
| `data-perusal-gate-state` | `[data-perusal-page]` | `locked` / `unlocked` | Gating system state |
| `data-perusal-gating-enabled` | `[data-perusal-page]` | `true` / absent | Whether gating is active for this score |
| `data-perusal-gate-init-started` | `[data-perusal-page]` | `true` / absent | Double-init guard for gate |
| `data-perusal-reveal-enabled` | `[data-perusal-page]` | `true` / absent | Whether reveal system is active |
| `data-perusal-reveal-state` | `[data-perusal-page]` | `loading` / `ready` | Reveal system state |
| `data-score-ready` | `.score-viewer` | `true` / `false` | Whether `announceReady()` has fired |
