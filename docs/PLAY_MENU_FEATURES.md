# Play Screen Menu Enhancements (Design & Implementation Notes)

## Summary
This document describes the implementation plan for two new play‑screen menu items for both the standard app (`index.html` + `js/app.js`) and the PWA (`PWA/poker.html`).

1. **Save & Exit**: Save the current game state and return to the title screen, then show a resume prompt on next launch.
2. **Share / Thank‑You Flow**: When exiting, show a “お疲れ様でした” popup with share buttons for X and LINE, plus a gentle re‑engagement CTA.

These features should align with the existing offline resume prompt and reuse existing modal/popup patterns where possible.

---

## 1. 「ゲームを保存して終了する」メニュー項目

### Goal
Allow the player to leave the game safely, preserving the current state. Next launch should show a resume prompt consistent with the existing offline resume flow.

### UX Flow
1. User opens the in‑game menu.
2. User taps **「保存して終了」**.
3. App saves the current offline state to storage and returns to the title screen.
4. Next app launch shows **「前回の途中から開始しますか？」** prompt.

### Storage Alignment
We already have offline resume snapshots implemented.

Standard app:
- `OFFLINE_RESUME_KEY = pocketpotOfflineResume`
- `saveOfflineSnapshot()` and `maybeShowOfflineResumePrompt()`

PWA:
- `OFFLINE_RESUME_KEY = pokerOfflineResume`
- `saveOfflineSnapshot()` and `maybeShowOfflineResumePrompt()`

Policy: “Save & Exit” must call the same snapshot path used by auto‑save. It should not create a new storage format.

### Implementation Notes
Standard app (`js/app.js`):
- Add a menu item `#menu-save-exit-btn` in `index.html` under `#header-menu`.
- On click:
  - `saveOfflineSnapshot()` immediately.
  - `setUiState('room')` and `gameState = null` via a new wrapper or reuse `resetToSetup()` with a new option that **does not** clear snapshot.
  - Ensure `offlineResumePending` is not triggered immediately in the same session by setting `offlineResumeDismissed = true` before switching to room.

PWA (`PWA/poker.html`):
- Add a menu item `#menu-save-exit-btn` in the header menu list.
- On click:
  - `saveOfflineSnapshot()` immediately.
  - Return to room screen via `setUiState('room')` and `gameState = null` without clearing snapshot.
  - Set `offlineResumeDismissed = true` to avoid immediate prompt.

### Suggested Copy
- Menu item: `保存して終了`
- Resume prompt title: `前回の途中から開始しますか？`
- Resume prompt body: `前回のゲームが見つかりました。続きから再開できます。`

### Edge Cases
- If the game is online (`appMode === 'online'` or `onlineState.role !== 'local'`), either:
  - Hide the menu item, or
  - Show a confirmation: `オンライン中は保存できません。退出しますか？`

Recommended: hide for online sessions in v1 to avoid confusing behavior.

---

## 2. 終了時の「共有・お疲れ様」導線

### Goal
Make the exit moment warm and social. Encourage sharing and replay without being pushy.

### UX Flow
1. User taps existing **「ゲーム終了して戻る」** (or its PWA equivalent).
2. A modal shows:
   - Title: `お疲れ様でした！`
   - Summary: total hands, winner names, total pot, etc.
   - CTA buttons: **X**, **LINE**
   - Soft CTA: `また遊ぶ` / `新しいゲームを始める`
3. After interaction, user can close and return to title screen.

### Data to Share
Prefer a lightweight summary that does not expose private info:
- Game length: number of hands (`handHistory.length`)
- Top winner: if available, winner name from last hand
- Total pot for last hand or average pot
- App link: `https://pocket-pot.vercel.app/`

### Share Text Examples
X:
- `友達ポーカーで遊んだ！{hands}ハンド / 最終ポット {pot}。Pocket Pot 便利だった。`

LINE:
- `友達ポーカーで遊んだよ！{hands}ハンド / 最終ポット {pot}。Pocket Pot でチップ管理してる。`

### Implementation Notes
Standard app (`index.html` + `js/app.js`):
- Add a new modal in `index.html`:
  - `#endgame-overlay` with title, summary, share buttons, and a “また遊ぶ” button.
- Hook into existing **`#menu-reset-btn`**:
  - Instead of immediate reset, show `#endgame-overlay`.
  - Provide `#endgame-share-x`, `#endgame-share-line`, and `#endgame-replay` buttons.
- Share URLs:
  - X: `https://x.com/intent/tweet?text=...&url=...`
  - LINE: `https://line.me/R/msg/text/?...`
- On “また遊ぶ”:
  - Close overlay and call a `startNewGameFromRoom()` or return to settings with cached names.
- On “閉じる”:
  - Proceed to `resetToSetup()` to exit.

PWA (`PWA/poker.html`):
- Add similar overlay markup and CSS, optionally reusing `.reconnect-overlay` style.
- Wire `#menu-reset-btn` to show the overlay first.

### Encouragement UX (Low‑pressure)
- Show a small “また遊ぶ” button near share buttons.
- Provide a one‑line message like `次のゲームもすぐ始められます。`.

### Edge Cases
- If `handHistory` is empty, share text should fall back to:
  - `友達ポーカーで遊んだ！Pocket Pot 便利だった。`
- If `gameState` is null, disable share buttons.

---

## Implementation Checklist (Both Versions)
1. Add menu item `保存して終了` and hook it to offline snapshot save.
2. Add endgame overlay modal with:
   - Summary text
   - X/LINE share buttons
   - “また遊ぶ” CTA
3. Ensure exit flow does **not** clear offline snapshot if user chose “保存して終了”.
4. Ensure offline resume prompt triggers on next launch.

---

## Testing
1. Start local game, play 1–2 hands, tap **保存して終了**.
2. Return to title, refresh the page.
3. Verify resume prompt appears and restores game state.
4. Tap **ゲーム終了して戻る**:
   - Verify overlay appears.
   - Verify X/LINE links open with valid text.
   - Verify “また遊ぶ” returns to settings/room correctly.
