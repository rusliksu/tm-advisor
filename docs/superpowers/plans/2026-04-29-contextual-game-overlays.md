# Contextual Game Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact contextual advisor overlays for endgame/tempo warnings and resource/action hints in the local TM extension.

**Architecture:** Keep scoring unchanged. Add a deterministic signal module, a small DOM renderer, and wire them from `content.js` during the existing refresh cycle. Mirror source files into `extension/` with explicit sync scripts.

**Tech Stack:** Chrome MV3 content scripts, plain JavaScript IIFEs, Node-based regression checks, existing extension sync scripts.

**Status:** Completed on the advisor live-fixes branch. This plan is kept as the implementation record; checked tasks correspond to the current source/runtime files and tests.

---

### Task 1: Signal Module

**Files:**
- Create: `apps/tm-extension/src/content-game-signals.js`
- Test: `apps/tm-extension/tests/content_game_signals_check.js`

- [x] **Step 1: Write the failing signal tests**

Create tests that require `content-game-signals.js`, then assert:

```js
const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_GAME_SIGNALS;
require(path.resolve(__dirname, '..', 'src', 'content-game-signals.js'));
const signals = global.TM_CONTENT_GAME_SIGNALS;

assert(signals, 'TM_CONTENT_GAME_SIGNALS should be loaded');

const state = {
  game: {
    phase: 'action',
    generation: 8,
    temperature: 2,
    oxygenLevel: 13,
    oceans: 8,
    turmoil: {coming: {name: 'Corrosive Rain', description: 'All players lose all heat.'}},
    awards: [{name: 'Thermalist', scores: [{color: 'hydro', score: 26}, {color: 'blue', score: 8}]}],
    milestones: [{name: 'Legend', playerName: null}],
  },
  thisPlayer: {
    color: 'hydro',
    heat: 26,
    plants: 8,
    megacredits: 20,
    terraformRating: 41,
    tags: {event: 5},
  },
  players: [
    {color: 'hydro', terraformRating: 41, victoryPointsBreakdown: {total: 66}},
    {color: 'blue', terraformRating: 17, victoryPointsBreakdown: {total: 57}},
  ],
};

const result = signals.computeGameSignals(state);
assert(result.some((s) => s.id === 'heat-event-risk'), 'heat event risk should be emitted');
assert(result.some((s) => s.id === 'spend-plants'), 'plant spend hint should be emitted');
assert(result.some((s) => s.id === 'finish-now'), 'finish-now hint should be emitted');
assert(result.some((s) => s.id === 'fund-thermalist'), 'Thermalist funding hint should be emitted');
```

- [x] **Step 2: Implement the module**

Expose `computeGameSignals(state)` on `global.TM_CONTENT_GAME_SIGNALS`. Return signals with `{id, severity, label, anchor, title, reasons, action}`. Limit no rendering logic to this file.

- [x] **Step 3: Run the test**

Run: `node apps/tm-extension/tests/content_game_signals_check.js`

Expected: `content-game-signals checks: OK`.

### Task 2: Overlay Renderer

**Files:**
- Create: `apps/tm-extension/src/content-game-overlays.js`
- Test: `apps/tm-extension/tests/content_game_overlays_check.js`

- [x] **Step 1: Write renderer tests**

Create a synthetic DOM with `querySelector`, `querySelectorAll`, `createElement`, and target elements for resources/actions. Assert renderer shows max one critical plus two hints and creates fallback stack when anchors are absent.

- [x] **Step 2: Implement renderer**

Expose `renderGameSignals({documentObj, signals})` and `clearGameSignals({documentObj})`. Render `.tm-game-signal-badge` elements with inline style and `title` tooltip fallback.

- [x] **Step 3: Run renderer tests**

Run: `node apps/tm-extension/tests/content_game_overlays_check.js`

Expected: `content-game-overlays checks: OK`.

### Task 3: Extension Wiring

**Files:**
- Modify: `apps/tm-extension/src/content.js`
- Modify: `apps/tm-extension/src/manifest.json`
- Modify: `extension/manifest.json`
- Modify: `apps/tm-extension/app-manifest.json`
- Modify: `apps/tm-extension/tests/syntax_check.js`

- [x] **Step 1: Add globals in `content.js`**

Add:

```js
var TM_CONTENT_GAME_SIGNALS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_GAME_SIGNALS) ? globalThis.TM_CONTENT_GAME_SIGNALS : null;
var TM_CONTENT_GAME_OVERLAYS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_GAME_OVERLAYS) ? globalThis.TM_CONTENT_GAME_OVERLAYS : null;
```

- [x] **Step 2: Call overlay update during refresh**

Add a small `updateGameSignals()` function that reads `getPlayerVueData()`, calls `computeGameSignals`, and passes the result to `renderGameSignals`. Call it in `processAll()` after player context updates and before VP overlays.

- [x] **Step 3: Register content scripts**

Insert `content-game-signals.js` and `content-game-overlays.js` before `content.js` in both manifests.

- [x] **Step 4: Update syntax check**

Add both runtime files to `JS_FILES`.

### Task 4: Sync Scripts

**Files:**
- Create: `tools/extension/sync-content-game-signals.js`
- Create: `tools/extension/sync-content-game-overlays.js`
- Create: `extension/content-game-signals.js`
- Create: `extension/content-game-overlays.js`

- [x] **Step 1: Add sync scripts**

Copy the existing `sync-content-overlays.js` structure and point it at the new source/runtime file pairs.

- [x] **Step 2: Sync runtime files**

Run:

```bash
node tools/extension/sync-content-game-signals.js
node tools/extension/sync-content-game-overlays.js
```

Expected: both runtime files are created under `extension/`.

### Task 5: Validation

**Files:**
- No source changes beyond previous tasks.

- [x] **Step 1: Run targeted tests**

Run:

```bash
node apps/tm-extension/tests/content_game_signals_check.js
node apps/tm-extension/tests/content_game_overlays_check.js
node apps/tm-extension/tests/reason_payload_fallback_check.js
```

- [x] **Step 2: Run extension checks**

Run:

```bash
node apps/tm-extension/tests/syntax_check.js
node tools/extension/sync-content-game-signals.js --check
node tools/extension/sync-content-game-overlays.js --check
node tools/extension/sync-content.js --check
node tools/extension/sync-content-tooltip.js --check
git diff --check
```

Expected: all pass.
