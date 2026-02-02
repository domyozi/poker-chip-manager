# Poker Chip Manager – Rules Specification
Based on Poker TDA 2024 v1

Source:
https://japanopenpoker.com/rule/pokertda2024v1/

---

## 1. Rule Authority
This application follows Poker TDA 2024 v1 as the primary rule authority.

If behavior is not explicitly defined here, TDA rules apply by default.

---

## 2. Betting Rules (No-Limit Hold’em)

### 2.1 Minimum Raise
- A raise must be at least the size of the previous bet or raise.
- The minimum raise amount is calculated as:
  minRaiseTo = currentBet + lastRaiseSize

(TDA Rule reference: Betting & Raising)

### 2.2 All-in Below Minimum Raise (Simplified)
Deviation from full TDA rules (intentional simplification):

- If a player goes all-in for less than the minimum raise amount:
  - This does NOT re-open betting for players who have already acted.
  - Players may only call, fold, or check if applicable.

Reason:
- Simplify implementation and UX.
- Avoid edge-case complexity in a chip-tracking app.

---

## 3. Action Order & Authority

### 3.1 Turn Enforcement
- Only the current turn player may act.
- After acting, the player cannot act again until the next valid turn.

### 3.2 Host Authority
- Host controls:
  - Game start
  - Next hand transition
- Host cannot perform multiple actions in the same turn.

---

## 4. Showdown & Winner Determination

### 4.1 Eligible Players
- Only players who have NOT folded are eligible to win the pot.

### 4.2 Chop Pot
- Chop is available only when:
  - Showdown phase
  - Two or more eligible players remain
- Folded players must never appear as chop candidates.

---

## 5. State Synchronization

- All state transitions (hand end, next hand) are driven by shared room state.
- When “Next Hand” is triggered, all clients transition automatically.

---

## 6. Display Rules

### 6.1 Chip vs BB Display
- Internal calculations use chips only.
- Display may toggle between:
  - Chips
  - BB (chips / bigBlind)

---

## 7. Known Deviations from TDA
- Simplified all-in minimum raise handling (Section 2.2)
- No enforcement of verbal action rules
- No penalty system

These deviations are intentional and documented.
