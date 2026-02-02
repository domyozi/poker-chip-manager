# Wireframe - Game Screen (Minimal)

## Layout (Base)
```
+---------------------------------------------------------+
| Logo + Title + Version               Status  [Menu ...] |
+---------------------------------------------------------+
| Phase Bar: PRE | FLOP | TURN | RIVER                     |
+---------------------------------------------------------+
| Join Status Banner (optional)                            |
| [Seat] [Cancel] [Rebuy]                                  |
+---------------------------------------------------------+
|                                                         |
|                     TABLE AREA                          |
|      players ring, community cards, pot in center        |
|                                                         |
+---------------------------------------------------------+
| Status Bar: POT | TO CALL | MIN RAISE                    |
+---------------------------------------------------------+
| Action Panel (only on your turn)                         |
| [FOLD] [CHECK/CALL] [RAISE] + slider/presets             |
+---------------------------------------------------------+
```

## Variants
- Waiting/Join: Join Status Banner visible, Action Panel hidden.
- Playing (your turn): Action Panel visible, banner hidden.
- Playing (not your turn): Banner hidden, Action Panel hidden, status text shown.

## Interaction Priorities
1) Menu and connection indicator always reachable.
2) Primary action buttons are large and above fold on mobile.
3) Status Bar is always visible and stable (no layout shift).
