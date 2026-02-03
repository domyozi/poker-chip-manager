/**
 * game-logic.js
 * Pure game logic functions - state transformations
 * No DOM access, no side effects, no global state mutations
 */

// ═══════════════════════════════════════════════════════════════
// SECTION: Helper Functions
// ═══════════════════════════════════════════════════════════════

function findNextActivePlayer(state, fromIndex) {
  const order = getSeatOrderIndices(state);
  const len = order.length;
  if (len === 0) return -1;
  const startPos = order.indexOf(fromIndex);
  const base = startPos === -1 ? 0 : startPos;
  for (let i = 1; i <= len; i++) {
    const idx = order[(base + i) % len];
    if (state.players[idx].status === "active") return idx;
  }
  return -1;
}

function findNextWithChips(state, fromIndex) {
  const order = getSeatOrderIndices(state);
  const len = order.length;
  if (len === 0) return -1;
  const startPos = order.indexOf(fromIndex);
  const base = startPos === -1 ? 0 : startPos;
  for (let i = 1; i <= len; i++) {
    const idx = order[(base + i) % len];
    const p = state.players[idx];
    // leftプレイヤーはスキップ
    if (p && p.chips > 0 && p.status !== 'left') return idx;
  }
  return fromIndex;
}

function getSeatOrderIndices(state) {
  if (!state || !Array.isArray(state.players)) return [];
  return state.players
    .map((p, i) => {
      const rawSeat = p && typeof p.seatIndex !== 'undefined' ? p.seatIndex : i;
      const seat = Number.isFinite(rawSeat) ? rawSeat : i;
      return { index: i, seat };
    })
    .sort((a, b) => (a.seat - b.seat) || (a.index - b.index))
    .map(item => item.index);
}

function countActivePlayers(state) {
  return state.players.filter(p => p.status === "active").length;
}

function countEligiblePlayers(state) {
  return state.players.filter(p => p.status !== "folded" && p.status !== "out" && p.status !== "left").length;
}

function getPotTotal(state) {
  return (state.pots || []).reduce((sum, p) => sum + p.amount, 0);
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Game Initialization
// ═══════════════════════════════════════════════════════════════

function initGame(playerInput, smallBlind, bigBlind, initialChips = 1000) {
  const sortedInput = (playerInput || [])
    .map((entry, i) => {
      const seatRaw = entry && typeof entry === 'object' ? (entry.seatIndex ?? entry.seat) : undefined;
      const seatIndex = Number.isFinite(seatRaw) ? seatRaw : (typeof seatRaw === 'string' && seatRaw.trim() !== '' ? parseInt(seatRaw, 10) : i);
      return { entry, seedIndex: i, seatIndex: Number.isFinite(seatIndex) ? seatIndex : i };
    })
    .sort((a, b) => (a.seatIndex - b.seatIndex) || (a.seedIndex - b.seedIndex));
  const players = sortedInput.map((item, i) => {
    const entry = item.entry;
    const name = typeof entry === 'string' ? entry : (entry?.name || '');
    const characterId = typeof entry === 'string' ? '' : (entry?.characterId || '');
    const finalName = name || `プレイヤー${i + 1}`;
    const stack = typeof entry === 'string' ? initialChips : (entry?.startingChips || initialChips);
    return {
      id: `player_${i}`, name: finalName, characterId, chips: stack,
      status: "waiting", currentBet: 0, totalBet: 0,
      actedThisRound: false,
      seatIndex: item.seatIndex
    };
  });
  return {
    players, smallBlind, bigBlind,
    phase: "preflop", currentPlayerIndex: 0, dealerIndex: 0,
    pots: [], currentMaxBet: 0, lastRaiseSize: bigBlind, actionHistory: [],
    isHandActive: false
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Blind Posting
// ═══════════════════════════════════════════════════════════════

function postBlind(state, playerIndex, amount) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: state.pots.map(p => ({...p})) };
  const player = s.players[playerIndex];
  const actualAmount = Math.min(amount, player.chips);
  player.chips -= actualAmount;
  player.currentBet = actualAmount;
  player.totalBet += actualAmount;
  if (player.chips === 0) player.status = "allIn";
  if (s.pots.length > 0) s.pots[0].amount += actualAmount;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Hand Management
// ═══════════════════════════════════════════════════════════════

function startHand(state) {
  let s = {
    ...state, isHandActive: true, phase: "preflop",
    players: state.players.map(p => {
      // 退席(left)プレイヤーはそのまま
      if (p.status === 'left') return { ...p, currentBet: 0, totalBet: 0, actedThisRound: false };
      // 離席中(sitout)プレイヤーはsitoutのまま、ブラインドは払う
      if (p.status === 'sitout') return { ...p, currentBet: 0, totalBet: 0, actedThisRound: true };
      // 通常のプレイヤー
      return {
        ...p,
        status: p.chips > 0 ? "active" : "out",
        currentBet: 0,
        totalBet: 0,
        actedThisRound: false
      };
    }),
    pots: [{ amount: 0, eligiblePlayerIds: state.players.filter(p => p.chips > 0 && p.status !== 'left').map(p => p.id) }],
    actionHistory: []
  };

  // 有効なプレイヤー（activeまたはsitout）
  const eligibleForPlay = s.players.filter(p => p.status === "active" || p.status === "sitout");
  const activePlayers = s.players.filter(p => p.status === "active");
  if (activePlayers.length <= 1) {
    s.isHandActive = false;
    s.phase = "finished";
    return s;
  }

  const n = eligibleForPlay.length;
  // ディーラーから次のプレイヤーを探す（sitoutも含む）
  const sbIdx = n === 2 ? s.dealerIndex : findNextEligible(s, s.dealerIndex);
  const bbIdx = findNextEligible(s, sbIdx);

  // ブラインドを投稿（sitoutプレイヤーも自動で払う）
  s = postBlind(s, sbIdx, s.smallBlind);
  s = postBlind(s, bbIdx, s.bigBlind);
  s.currentMaxBet = s.bigBlind;
  s.lastRaiseSize = s.bigBlind;
  s.pots = buildPotsFromBets(s.players);

  // 最初のアクションプレイヤーを探す（activeのみ）
  const firstToAct = findNextActivePlayer(s, bbIdx);
  s.currentPlayerIndex = firstToAct !== -1 ? firstToAct : s.dealerIndex;

  return s;
}

// sitoutプレイヤーも含めて次のプレイヤーを探す
function findNextEligible(state, fromIndex) {
  const order = getSeatOrderIndices(state);
  const len = order.length;
  if (len === 0) return -1;
  const startPos = order.indexOf(fromIndex);
  const base = startPos === -1 ? 0 : startPos;
  for (let i = 1; i <= len; i++) {
    const idx = order[(base + i) % len];
    const p = state.players[idx];
    if (p && (p.status === "active" || p.status === "sitout") && p.chips > 0) return idx;
  }
  return -1;
}

function endHand(state) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: [...(state.pots||[])] };
  s.phase = "showdown";
  s.isHandActive = false;
  return s;
}

function advanceDealer(state) {
  const order = getSeatOrderIndices(state);
  if (order.length === 0) return { ...state };
  const pos = order.indexOf(state.dealerIndex);
  const nextIndex = order[(pos === -1 ? 0 : (pos + 1) % order.length)];
  return { ...state, dealerIndex: nextIndex };
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Action Validation & Application
// ═══════════════════════════════════════════════════════════════

function validateAction(state, type, amount) {
  const player = state.players[state.currentPlayerIndex];
  const callAmt = state.currentMaxBet - player.currentBet;
  switch (type) {
    case "fold": return { resolvedAmount: 0 };
    case "check":
      if (callAmt > 0) return { error: "コールが必要です" };
      return { resolvedAmount: 0 };
    case "call":
      if (callAmt === 0) return { error: "コールする必要がありません" };
      return { resolvedAmount: Math.min(callAmt, player.chips) };
    case "raise": {
      const need = amount - player.currentBet;
      const minRaiseTo = state.currentMaxBet + state.lastRaiseSize;
      const allInTo = player.currentBet + player.chips;
      if (amount < minRaiseTo && amount < allInTo) {
        return { error: `レイズ額は最低 ${minRaiseTo}` };
      }
      if (amount >= allInTo) return { resolvedAmount: player.chips, isShortAllIn: amount < minRaiseTo };
      return { resolvedAmount: need };
    }
    default: return { error: "不明" };
  }
}

function addToMainPot(pots, amount) {
  if (pots.length === 0) return [{ amount, eligiblePlayerIds: [] }];
  return pots.map((p, i) => i === 0 ? { ...p, amount: p.amount + amount } : p);
}

function buildPotsFromBets(players) {
  // totalBetのレベルごとにポットを分割し、同一のeligibleは後で統合する
  const levels = Array.from(new Set(players.map(p => p.totalBet || 0).filter(v => v > 0)))
    .sort((a, b) => a - b);
  if (levels.length === 0) return [];

  const pots = [];
  let prev = 0;
  levels.forEach(level => {
    const contributors = players.filter(p => (p.totalBet || 0) >= level);
    const amount = (level - prev) * contributors.length;
    if (amount <= 0) {
      prev = level;
      return;
    }
    const eligible = contributors.filter(p => p.status !== "folded" && p.status !== "out" && p.status !== "left");
    pots.push({
      amount,
      eligiblePlayerIds: eligible.map(p => p.id)
    });
    prev = level;
  });

  // 隣接ポットでeligibleが同じ場合は統合（オールインが無い時は1つにまとまる）
  const merged = [];
  pots.forEach(pot => {
    const last = merged[merged.length - 1];
    if (last && last.eligiblePlayerIds.join(',') === pot.eligiblePlayerIds.join(',')) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  });
  return merged;
}

function applyAction(state, playerIdx, type, amount, meta = {}) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: state.pots.map(p => ({...p})) };
  const player = s.players[playerIdx];
  const prevMax = s.currentMaxBet;

  player.actedThisRound = true;

  switch (type) {
    case "fold":
      player.status = "folded";
      break;
    case "check":
      break;
    case "call":
      player.chips -= amount;
      player.currentBet += amount;
      player.totalBet += amount;
      if (player.chips === 0) player.status = "allIn";
      s.pots = addToMainPot(s.pots, amount);
      break;
    case "raise":
      player.chips -= amount;
      player.currentBet += amount;
      player.totalBet += amount;
      s.currentMaxBet = player.currentBet;
      if (player.chips === 0) player.status = "allIn";
      s.pots = addToMainPot(s.pots, amount);
      {
        const raiseSize = player.currentBet - prevMax;
        const isFullRaise = raiseSize >= s.lastRaiseSize;
        if (isFullRaise) {
          s.lastRaiseSize = raiseSize;
          s.players.forEach((p, i) => {
            if (i !== playerIdx && p.status === "active") p.actedThisRound = false;
          });
        }
      }
      break;
  }
  s.pots = buildPotsFromBets(s.players);
  const next = findNextActivePlayer(s, playerIdx);
  s.currentPlayerIndex = next !== -1 ? next : playerIdx;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Phase Management
// ═══════════════════════════════════════════════════════════════

function advanceToNextPhase(state) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: (state.pots||[]).map(p => ({...p})) };
  const order = ["preflop","flop","turn","river","showdown"];
  const ci = order.indexOf(s.phase);
  if (ci >= order.length - 1) { s.phase = "showdown"; s.isHandActive = false; return s; }
  s.phase = order[ci + 1];
  if (s.phase === "showdown") { s.isHandActive = false; return s; }
  s.currentMaxBet = 0;
  s.lastRaiseSize = s.bigBlind;
  s.players = s.players.map(p => ({ ...p, currentBet: 0, actedThisRound: false }));
  const first = findNextActivePlayer(s, s.dealerIndex);
  s.currentPlayerIndex = first !== -1 ? first : s.currentPlayerIndex;
  return s;
}

function checkAndAdvancePhase(state) {
  let s = { ...state };

  if (countEligiblePlayers(s) === 1) return endHand(s);

  const hasUnmatched = s.players.some(p => p.status === "active" && p.currentBet < s.currentMaxBet);
  if (hasUnmatched) return s;

  const hasUnacted = s.players.some(p => p.status === "active" && !p.actedThisRound);
  if (hasUnacted) return s;

  if (countActivePlayers(s) <= 1) {
    s = advanceToNextPhase(s);
    while (s.phase !== "showdown" && countActivePlayers(s) <= 1) s = advanceToNextPhase(s);
    return s;
  }

  s = advanceToNextPhase(s);
  return s;
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Action Processing
// ═══════════════════════════════════════════════════════════════

function processAction(state, actionType, amount = 0) {
  if (!state.isHandActive) return { error: "ハンドが進行していません" };
  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];
  if (player.status !== "active") return { error: "アクション不可" };
  const v = validateAction(state, actionType, amount);
  if (v.error) return { error: v.error };
  let s = applyAction(state, playerIdx, actionType, v.resolvedAmount, v);
  s.actionHistory = [...(s.actionHistory||[]), {
    id: newActionId(), type: actionType, playerId: player.id,
    amount: v.resolvedAmount, timestamp: Date.now()
  }];
  s = checkAndAdvancePhase(s);
  return s;
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Pot Distribution
// ═══════════════════════════════════════════════════════════════

function distributePot(state, winnerIds) {
  const s = { ...state, players: state.players.map(p => ({...p})) };
  if (!winnerIds || (Array.isArray(winnerIds) && winnerIds.length === 0)) return s;
  const order = getSeatOrderIndices(s);
  const buttonPos = order.indexOf(s.dealerIndex);
  const orderFromButton = buttonPos === -1
    ? order
    : order.slice(buttonPos + 1).concat(order.slice(0, buttonPos + 1));
  const potWinners = Array.isArray(winnerIds[0])
    ? winnerIds
    : (s.pots || []).map(() => winnerIds);

  (s.pots || []).forEach((pot, potIndex) => {
    const winnersForPot = potWinners[potIndex] || [];
    const eligibleWinners = winnersForPot.filter(id => pot.eligiblePlayerIds.includes(id));
    if (eligibleWinners.length === 0) return;
    const per = Math.floor(pot.amount / eligibleWinners.length);
    const rem = pot.amount - per * eligibleWinners.length;
    s.players = s.players.map(p => (
      eligibleWinners.includes(p.id) ? { ...p, chips: p.chips + per } : p
    ));
    if (rem > 0) {
      let bonusId = eligibleWinners[0];
      for (const idx of orderFromButton) {
        const pid = s.players[idx]?.id;
        if (eligibleWinners.includes(pid)) {
          bonusId = pid;
          break;
        }
      }
      s.players = s.players.map(p => (
        p.id === bonusId ? { ...p, chips: p.chips + rem } : p
      ));
    }
  });
  s.pots = [];
  return s;
}
