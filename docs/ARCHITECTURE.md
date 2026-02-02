# Architecture Notes (UI / App)

## Purpose
Define clear boundaries so UI changes do not cascade into game logic or networking.

## Current Core States
- uiState: room | waiting | settings | playing
- onlineState: role, roomCode, displayName, seat, ready, connected
- gameState: table state (from game-logic.js)

## Separation Targets (No Code Change Yet)
1) State layer
- Owns mutable state and rules for state transitions.
- No direct DOM access.
- Example responsibilities: setUiState, updatePresence payloads, applyDisplayMode.

2) View layer
- Owns DOM updates only.
- No state mutation besides rendering from passed state.
- Example responsibilities: render(), updateHeaderMenuVisibility(), updatePlayerBadge().

3) Controller layer
- Owns event binding and delegates to state/view.
- Example responsibilities: DOMContentLoaded setup, bindOnce handlers.

4) Services
- External I/O: Supabase, localStorage, clipboard, audio, service worker.
- Keep side effects centralized.

## Naming Rules (Recommended)
- handleX: event handlers only (no DOM queries inside other than target).
- setX / updateX: state mutations only.
- renderX / syncX: DOM updates only.
- requestX: network intent (broadcast / RPC style).

## Suggested File Split (Optional)
- js/app/state.js
- js/app/view.js
- js/app/controller.js
- js/app/services/supabase.js
- js/app/services/storage.js
- js/app/services/audio.js

## Guardrails
- game-logic.js stays DOM-free and side-effect free.
- Avoid implicit state changes inside render functions.
- One event handler should call one state mutation, then one render pass.
