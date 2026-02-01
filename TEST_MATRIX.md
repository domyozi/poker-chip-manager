# 2-Player Test Matrix

## 1) Setup / Join / Leave / Rejoin
Steps:
1. Open on Host device, create room.
2. Open on Player device, join with code.
3. Player leaves (Back button).
4. Player rejoin with same code.
Expected UI:
- Back returns to Room screen.
- Room code usable again.
Expected state:
- Presence is cleared on leave.
- Rejoin succeeds without ghost session.

## 2) Seat Select / Ready / Host Flow
Steps:
1. Host selects a seat.
2. Player selects a seat.
3. Player presses READY.
Expected UI:
- Host READY button is hidden.
- “設定へ進む” enabled only after player READY.
Expected state:
- Host is implicitly ready after seat selection.
- Player ready stored in presence.

## 3) Preflop: Check/Call/Raise/Min-raise Validation/All-in
Steps:
1. Preflop with blinds posted.
2. Attempt raise below Min Raise.
3. Raise to Min Raise.
4. All-in below Min Raise (short stack).
Expected UI:
- “Min Raise: X” shown.
- Invalid raise blocked with error.
Expected state:
- Min Raise enforces lastRaiseSize.
- Short all-in does NOT reopen action.

## 4) Postflop Phase Transitions
Steps:
1. Complete preflop action.
2. Verify flop/turn/river transitions.
Expected UI:
- Phase bar advances correctly.
Expected state:
- currentMaxBet resets each round.
- lastRaiseSize resets to BB each round.

## 5) Fold Ends Hand
Steps:
1. Player folds in heads-up.
Expected UI:
- Showdown or next-hand flow shown.
Expected state:
- Winner is remaining active player.

## 6) Showdown Winner Selection
Steps:
1. Reach showdown with two active players.
2. Select winner and confirm.
Expected UI:
- Folded players not shown.
- Chop toggle shown only if 2+ eligible.
Expected state:
- Pot distributed to winner(s).

## 7) Next Hand Sync
Steps:
1. After showdown, press “次のハンド” on any client.
Expected UI:
- Both clients move to next hand.
Expected state:
- Host advances and broadcasts state.
