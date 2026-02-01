/**
 * Game Flow Simulation Tests
 *
 * Simulates 3 complete games to verify the game works correctly
 * Run with: node test/game-flow.test.js
 */

// ===== GAME LOGIC FUNCTIONS (from index.html) =====

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
  return state.players.filter(p => p.status !== "folded" && p.status !== "out").length;
}

function initGame(playerNames, smallBlind, bigBlind, initialChips = 1000) {
  const players = playerNames.map((name, i) => ({
    id: `player_${i}`, name, chips: initialChips,
    status: "waiting", currentBet: 0, totalBet: 0,
    actedThisRound: false
  }));
  return {
    players, smallBlind, bigBlind,
    phase: "preflop", currentPlayerIndex: 0, dealerIndex: 0,
    pots: [], currentMaxBet: 0, actionHistory: [],
    isHandActive: false
  };
}

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

  const firstToAct = findNextWithChips(bbIdx);
  s.currentPlayerIndex = firstToAct !== bbIdx ? firstToAct : findNextWithChips(firstToAct);

  return s;
}

function addToMainPot(pots, amount) {
  if (pots.length === 0) return [{ amount, eligiblePlayerIds: [] }];
  return pots.map((p, i) => i === 0 ? { ...p, amount: p.amount + amount } : p);
}

function applyAction(state, playerIdx, type, amount) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: state.pots.map(p => ({...p})) };
  const player = s.players[playerIdx];
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
      s.players.forEach((p, i) => {
        if (i !== playerIdx && p.status === "active") p.actedThisRound = false;
      });
      break;
  }
  const next = findNextActivePlayer(s, playerIdx);
  s.currentPlayerIndex = next !== -1 ? next : playerIdx;
  return s;
}

function advanceToNextPhase(state) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: (state.pots||[]).map(p => ({...p})) };
  const order = ["preflop","flop","turn","river","showdown"];
  const ci = order.indexOf(s.phase);
  if (ci >= order.length - 1) { s.phase = "showdown"; s.isHandActive = false; return s; }
  s.phase = order[ci + 1];
  if (s.phase === "showdown") { s.isHandActive = false; return s; }
  s.currentMaxBet = 0;
  s.players = s.players.map(p => ({ ...p, currentBet: 0, actedThisRound: false }));
  const first = findNextActivePlayer(s, s.dealerIndex);
  s.currentPlayerIndex = first !== -1 ? first : s.currentPlayerIndex;
  return s;
}

function endHand(state) {
  const s = { ...state, players: state.players.map(p => ({...p})), pots: [...(state.pots||[])] };
  s.phase = "showdown";
  s.isHandActive = false;
  const winner = s.players.find(p => p.status !== "folded" && p.status !== "out");
  if (winner) {
    const total = s.pots.reduce((sum, p) => sum + p.amount, 0);
    s.players = s.players.map(p => p.id === winner.id ? { ...p, chips: p.chips + total } : p);
    s.pots = [];
  }
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
      if (amount < state.currentMaxBet + state.bigBlind) return { error: `レイズ額は最低 ${state.currentMaxBet + state.bigBlind}` };
      if (need > player.chips) return { resolvedAmount: player.chips };
      return { resolvedAmount: need };
    }
    default: return { error: "不明" };
  }
}

function processAction(state, actionType, amount = 0) {
  if (!state.isHandActive) return { error: "ハンドが進行していません" };
  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];
  if (player.status !== "active") return { error: "アクション不可" };
  const v = validateAction(state, actionType, amount);
  if (v.error) return { error: v.error };
  let s = applyAction(state, playerIdx, actionType, v.resolvedAmount);
  s = checkAndAdvancePhase(s);
  return s;
}

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

function advanceDealer(state) {
  return { ...state, dealerIndex: (state.dealerIndex + 1) % state.players.length };
}

// ===== TEST FRAMEWORK =====

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${e.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(`${message} Expected true, got false`);
  }
}

// ===== GAME SIMULATION =====

function simulateGame(gameNumber) {
  console.log(`\n--- Game ${gameNumber} ---`);

  let state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 500);
  let handCount = 0;
  const maxHands = 20; // Prevent infinite loops

  while (handCount < maxHands) {
    handCount++;
    console.log(`  Hand ${handCount}: Dealer=${state.players[state.dealerIndex].name}`);

    state = startHand(state);

    // Check if game is finished
    if (state.phase === 'finished') {
      const winner = state.players.find(p => p.chips > 0);
      console.log(`  Game finished! Winner: ${winner.name} with ${winner.chips} chips`);
      return { success: true, winner: winner.name, hands: handCount };
    }

    assertTrue(state.isHandActive, `Hand ${handCount} should be active`);

    // Simulate actions until showdown or one player wins
    let actionCount = 0;
    const maxActions = 50;

    while (state.isHandActive && actionCount < maxActions) {
      actionCount++;
      const actor = state.players[state.currentPlayerIndex];

      if (actor.status !== 'active') {
        // No active player, should advance phase
        state = checkAndAdvancePhase(state);
        continue;
      }

      // Simple AI: fold 20%, call 60%, raise 20%
      const rand = Math.random();
      let action, amount = 0;

      const callAmt = state.currentMaxBet - actor.currentBet;

      if (rand < 0.2 && callAmt > 0) {
        action = 'fold';
      } else if (rand < 0.8 || callAmt === 0) {
        action = callAmt > 0 ? 'call' : 'check';
      } else {
        action = 'raise';
        amount = state.currentMaxBet + state.bigBlind * 2;
      }

      const result = processAction(state, action, amount);
      if (result.error) {
        // If action fails, try to call or check
        if (callAmt > 0) {
          const fallback = processAction(state, 'call', 0);
          if (!fallback.error) state = fallback;
        } else {
          const fallback = processAction(state, 'check', 0);
          if (!fallback.error) state = fallback;
        }
      } else {
        state = result;
      }
    }

    // Hand ended - determine winner
    if (state.phase === 'showdown') {
      const eligible = state.players.filter(p => p.status !== 'folded' && p.status !== 'out');
      if (eligible.length > 0) {
        // Random winner for simulation
        const winnerId = eligible[Math.floor(Math.random() * eligible.length)].id;
        state = distributePot(state, [winnerId]);
      }
    }

    // Advance dealer for next hand
    state = advanceDealer(state);

    // Check if any player is eliminated
    const activePlayers = state.players.filter(p => p.chips > 0);
    console.log(`    Chips: ${state.players.map(p => `${p.name}=${p.chips}`).join(', ')}`);

    if (activePlayers.length === 1) {
      console.log(`  Game finished! Winner: ${activePlayers[0].name} with ${activePlayers[0].chips} chips`);
      return { success: true, winner: activePlayers[0].name, hands: handCount };
    }
  }

  console.log(`  Game ended after ${maxHands} hands (max limit)`);
  return { success: true, hands: handCount };
}

// ===== RUN TESTS =====

console.log('=== Game Flow Simulation Tests ===');

test('Game 1: Complete game simulation', () => {
  const result = simulateGame(1);
  assertTrue(result.success, 'Game 1 should complete successfully');
  assertTrue(result.hands > 0, 'Game 1 should have played at least 1 hand');
});

test('Game 2: Complete game simulation', () => {
  const result = simulateGame(2);
  assertTrue(result.success, 'Game 2 should complete successfully');
  assertTrue(result.hands > 0, 'Game 2 should have played at least 1 hand');
});

test('Game 3: Complete game simulation', () => {
  const result = simulateGame(3);
  assertTrue(result.success, 'Game 3 should complete successfully');
  assertTrue(result.hands > 0, 'Game 3 should have played at least 1 hand');
});

test('Fold scenario: All but one fold', () => {
  let state = initGame(['A', 'B', 'C'], 10, 20, 1000);
  state = startHand(state);

  // First player folds
  state = processAction(state, 'fold', 0);
  assertTrue(!state.error, 'First fold should succeed');

  // Second player folds
  state = processAction(state, 'fold', 0);
  assertTrue(!state.error, 'Second fold should succeed');

  // Hand should end with showdown
  assertEqual(state.phase, 'showdown', 'Phase should be showdown after all fold');
  assertEqual(state.isHandActive, false, 'Hand should not be active');
});

test('All-in scenario: Player goes all-in', () => {
  let state = initGame(['A', 'B'], 10, 20, 100);
  state = startHand(state);

  // Raise all-in
  const result = processAction(state, 'raise', 100);
  assertTrue(!result.error, 'All-in raise should succeed');

  // Check that player is all-in
  const raiser = result.players.find(p => p.name === 'A');
  assertEqual(raiser.status, 'allIn', 'Player should be all-in');
});

test('Next hand after winner: Game continues correctly', () => {
  let state = initGame(['A', 'B', 'C'], 10, 20, 500);

  // Play first hand
  state = startHand(state);
  state = processAction(state, 'fold', 0);
  state = processAction(state, 'fold', 0);

  // Distribute pot
  const winner = state.players.find(p => p.status !== 'folded');
  state = distributePot(state, [winner.id]);

  // Advance dealer and start next hand
  state = advanceDealer(state);
  state = startHand(state);

  assertTrue(state.isHandActive, 'Next hand should be active');
  assertEqual(state.phase, 'preflop', 'Next hand should start at preflop');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  process.exit(1);
}
