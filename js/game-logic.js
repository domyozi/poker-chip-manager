/**
 * game-logic.js
 * Pure game logic functions - state transformations
 * No DOM access, no side effects, no global state mutations
 */

// ═══════════════════════════════════════════════════════════════
// SECTION: Helper Functions
// ═══════════════════════════════════════════════════════════════

function findNextActivePlayer(state, fromIndex) {
  const len = state.players.length;
  for (let i = 1; i <= len; i++) {
    const idx = (fromIndex + i) % len;
    if (state.players[idx].status === "active") return idx;
  }
  return -1;
}

function countActivePlayers(state) {
  return state.players.filter(p => p.status === "active").length;
}

function countEligiblePlayers(state) {
  return state.players.filter(p => p.status !== "folded").length;
}

function getPotTotal(state) {
  return (state.pots || []).reduce((sum, p) => sum + p.amount, 0);
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Game Initialization
// ═══════════════════════════════════════════════════════════════

function initGame(playerInput, smallBlind, bigBlind, initialChips = 1000) {
  const players = playerInput.map((entry, i) => {
    const name = typeof entry === 'string' ? entry : (entry?.name || '');
    const characterId = typeof entry === 'string' ? '' : (entry?.characterId || '');
    const finalName = name || `プレイヤー${i + 1}`;
    const stack = typeof entry === 'string' ? initialChips : (entry?.startingChips || initialChips);
    return {
      id: `player_${i}`, name: finalName, characterId, chips: stack,
      status: "waiting", currentBet: 0, totalBet: 0,
      actedThisRound: false
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
    players: state.players.map(p => ({
      ...p,
      status: p.chips > 0 ? "active" : "out",
      currentBet: 0,
      actedThisRound: false
    })),
    pots: [{ amount: 0, eligiblePlayerIds: state.players.filter(p => p.chips > 0).map(p => p.id) }],
    actionHistory: []
  };

  const activePlayers = s.players.filter(p => p.status === "active");
  if (activePlayers.length <= 1) {
    s.isHandActive = false;
    s.phase = "finished";
    return s;
  }

  const n = s.players.length;
  const findNextWithChips = (fromIdx) => {
    for (let i = 1; i <= n; i++) {
      const idx = (fromIdx + i) % n;
      if (s.players[idx].chips > 0) return idx;
    }
    return fromIdx;
  };

  const sbIdx = n === 2 ? s.dealerIndex : findNextWithChips(s.dealerIndex);
  const bbIdx = findNextWithChips(sbIdx);
  s = postBlind(s, sbIdx, s.smallBlind);
  s = postBlind(s, bbIdx, s.bigBlind);
  s.currentMaxBet = s.bigBlind;
  s.lastRaiseSize = s.bigBlind;

  const firstToAct = findNextWithChips(bbIdx);
  s.currentPlayerIndex = firstToAct !== bbIdx ? firstToAct : findNextWithChips(firstToAct);

  return s;
}

function endHand(state) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: [...(state.pots||[])] };
  s.phase = "showdown";
  s.isHandActive = false;
  return s;
}

function advanceDealer(state) {
  return { ...state, dealerIndex: (state.dealerIndex + 1) % state.players.length };
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
  const total = (s.pots||[]).reduce((sum, p) => sum + p.amount, 0);
  if (winnerIds.length === 0) return s;
  const per = Math.floor(total / winnerIds.length);
  const rem = total - per * winnerIds.length;
  s.players = s.players.map((p, i) => {
    if (winnerIds.includes(p.id)) {
      const bonus = i === s.players.findIndex(pl => winnerIds.includes(pl.id)) ? rem : 0;
      return { ...p, chips: p.chips + per + bonus };
    }
    return p;
  });
  s.pots = [];
  return s;
}
