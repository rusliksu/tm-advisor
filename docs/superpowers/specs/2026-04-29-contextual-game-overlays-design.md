# Contextual Game Overlays Design

Date: 2026-04-29

## Status

Implemented on the advisor live-fixes branch. The MVP exists as `content-game-signals.js` and `content-game-overlays.js`, is wired from `content.js`, and has runtime mirrors under `extension/`.

## Goal

Move the most important advisor information out of the dense side/panel text and onto the game elements where the player makes decisions. The MVP focuses on endgame and tempo warnings plus resource/action hints. Card overlays remain mostly as they are.

## Problem

The extension currently surfaces a lot of useful reasoning, but too much of it is packed into small text blocks. In live play, the expensive mistakes are not usually missed card ratings; they are missed game-state signals:

- an incoming event will destroy heat or plants;
- heat/plants should be spent before they are attacked or invalidated;
- a global parameter action closes the game;
- a milestone or award should be funded before the swing disappears;
- a standard project is correct because the game must end now.

Those signals should appear near heat, plants, global parameters, standard projects, awards, milestones, and relevant action buttons.

## MVP Scope

Implement a contextual overlay layer for player-view action states:

- Show at most one critical alert and two action hints at once.
- Attach hints to existing UI elements when a stable target can be found.
- Fall back to a compact top-left warning stack when no stable target exists.
- Keep detailed reasoning in tooltip-style hover/click text.
- Move the tooltip copy button to the top-left corner.

Out of scope for the MVP:

- Rewriting card scoring.
- Replacing the existing card tooltip UI.
- Annotating every possible game element.
- Adding broad layout or module restructuring.

## Signals

The first signal set should cover:

- Heat event risk: upcoming global event removes or invalidates heat, and the player has enough heat to raise temperature.
- Plant risk: exposed plants should be spent soon, especially near the endgame.
- Endgame closure: an action closes oxygen, temperature, or oceans, or creates a cascade that ends the game.
- Finish-now state: the player is ahead or will be worse off in another generation, so terraforming actions get a positive urgency hint.
- Award and milestone lock: funding now is likely worth 5 VP or prevents a large opponent swing.

Each signal should include:

- severity: `critical`, `warning`, or `info`;
- short label for the overlay;
- compact reason for the tooltip;
- preferred anchor type: resource, global parameter, standard project, award, milestone, or fallback stack.

## UI Model

Critical overlays should be short, visible, and restrained:

- `Spend heat`
- `Plants exposed`
- `Funds Thermalist`
- `Ends game`
- `Finish now`

Color usage:

- red for resource loss or missed irreversible opportunity;
- amber for timing risk;
- green for recommended conversion or funding action;
- neutral/dark for informational hints.

The overlay should not resize game elements or cover card names. It should use absolute positioning inside or near an anchor and pointer events only when it opens a tooltip.

## Data Flow

Use the current player/game state already available to the content script:

1. Read `pv.game`, `pv.thisPlayer`, public player summaries, global parameters, colonies, milestones, awards, and turmoil events.
2. Compute contextual signals in a small extension-owned module.
3. Render signals through a dedicated overlay renderer.
4. Recompute on existing refresh/update cycles.
5. Keep card scoring and smartbot logic untouched in the first implementation.

The signal module should be deterministic and testable without the DOM. The renderer should be separately testable with synthetic DOM anchors.

## Architecture

Add focused extension modules:

- `content-game-signals.js`: computes contextual game signals from player state.
- `content-game-overlays.js`: finds anchors and renders/removes overlay badges.

Wire them from `content.js`, then sync generated/runtime copies to `extension/` using the repo's existing extension sync pattern.

No cross-app imports. No generated file should become source of truth.

## Tooltip Behavior

Overlay badges should expose a concise tooltip:

- title;
- 1-3 reason lines;
- suggested action when available;
- optional copy button in the top-left corner.

Existing card tooltip copy button should move to top-left as a separate small UI polish change in the same feature branch, because it affects the same tooltip surface but not scoring.

## Testing

Add targeted extension tests:

- signal computation for heat event risk;
- signal computation for endgame closure;
- award/milestone funding signal;
- renderer keeps max one critical plus two hints;
- tooltip copy button is placed top-left.

Run the existing extension syntax and sync checks after implementation.

Current checks:

- `extension:test-content-game-signals`
- `extension:test-content-game-overlays`
- `extension:check-content-game-signals`
- `extension:check-content-game-overlays`
- `extension:check-content`
- `test:syntax`

## Rollout

Implement in two small passes:

1. UI transport: overlay module, anchor finder, max visible hints, tooltip copy button position.
2. Signals: heat/plants/endgame/funding rules.

This keeps the visible UI work separate from future scoring calibration.
