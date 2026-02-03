# Requests

## Purpose
Track incoming feature requests and UX changes separately from progress and requirements.

## How to Add
- 1 request = 1 bullet
- Include priority (P0/P1/P2)
- Include short acceptance criteria

## Active Requests
- (none)

## Logged Specs (Implemented)
- P1: Offline視点ローテーション（次アクターが常に手前）｜Acceptance: オフラインで各アクション後、次のアクターが手前に来て表示順が安定する
- P1: 座席の正順（seatIndex）に基づく回転｜Acceptance: 配列順に依存せず、seatIndexに基づき表示と進行順が決定される
- P1: テーブル画像を縦型（table-tate.png）に置換｜Acceptance: 中央テーブルが新画像で崩れず表示される
- P1: プレイヤー配置をテーブル周囲の固定アンカーに変更｜Acceptance: 2〜8人で重なりなく配置される
- P2: ベットチップ表示を固定座標に分離（table-bets内）｜Acceptance: 各プレイヤーのベット量がテーブル側に安定表示される
- P2: POT表示とBlinds表示の分離｜Acceptance: POTは1行表示、Blindsは別行で表示される
- P2: POT上にストックチップ表示（stockchip）｜Acceptance: POTとは別枠でチップ画像+合計量が表示される
- P2: 勝利後の上部表示をPOT総額表記に統一｜Acceptance: 結果表示の上段が「POT総額 ◯◯」になる
- P2: オフライン時の接続インジケータ非表示｜Acceptance: offline/localで「接続中」が出ない
- P2: 音量ON/OFFトグル復帰（メニュー）｜Acceptance: メニューから音量が切り替えられる
- P2: 履歴リストのアバター縮小｜Acceptance: 履歴の画像が小さくなり視認性が改善する
- P1: ショーダウンでポット別勝者選択タブ｜Acceptance: メイン/サイドごとに勝者を選択でき、自動割当が動作する

## Guidelines
- UI flow or screen structure changes must update:
  - docs/STATE_FLOW.md
  - docs/WIREFRAME_GAME_SCREEN.md
