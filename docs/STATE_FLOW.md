# UI State Flow (Minimal)

## Mermaid
```mermaid
stateDiagram-v2
  [*] --> room
  room --> waiting: host/create | join/player
  room --> settings: local
  waiting --> settings: host/start settings
  settings --> playing: start game
  playing --> settings: end hand / reset
  playing --> room: leave / disconnect
  waiting --> room: leave
  settings --> room: leave
```

## Notes
- uiState is the single source of screen visibility.
- Any transition should go through setUiState().
- Non-host flows should not jump to settings or playing without a host action.
