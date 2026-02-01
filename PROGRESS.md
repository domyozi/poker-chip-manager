# Progress

## Current Version
- v0.4.0 (2026-02-01)

## ✅ Done
- Added center table image (card-back watermark)
- Added visible version label (top-right)
- Phase indicator community cards: 5 slots always; fill 0→3→4→5 using img/trump.png

## 🛠 In Progress
- P0: Mobile room code input (typing/deleting breaks on iOS)
- P0: Showdown freeze (overlay / state transition)

## 🧭 Next Up
- P1: Improve in-play status visibility (phase/pot/to-call/turn)
- P2: Card visuals upgrade (deferred)
- P2: Raise UI redesign (presets + adjust) (deferred)

## ⚠️ Known Issues / Risks
- iOS Safari keyboard + fixed layers can break input focus
- Overlay stacking may block taps during showdown

## 🔎 Quick Verification Checklist
- [ ] Play screen shows center logo, doesn’t block taps
- [ ] Version is visible on top-right
- [ ] No console errors when card-back.png is missing
- [ ] Preflop: 5 empty slots visible
- [ ] Flop/Turn/River: slots fill 3/4/5 with img/trump.png

## Release Notes
### v0.4.0
- Phase indicator community cards: 5 slots always; fill 0→3→4→5 using img/trump.png

### v0.3.0
- Added center table image (card-back watermark) using img/trump.png

### v0.2.0
- Added center logo card-back watermark
- Added PROGRESS.md for tracking
- Added version label for deployment verification
