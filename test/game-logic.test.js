/**
 * Poker Game Logic Tests
 *
 * Run with: node test/game-logic.test.js
 */

// Extract game logic functions for testing
// These are copies of the core functions from index.html

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
  // チップ0のプレイヤーは "out" に、それ以外は "active" に
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

  // アクティブなプレイヤーが1人以下ならゲーム終了
  const activePlayers = s.players.filter(p => p.status === "active");
  if (activePlayers.length <= 1) {
    s.isHandActive = false;
    s.phase = "finished";
    return s;
  }

  const n = s.players.length;

  // チップがあるプレイヤーの中でディーラー/ブラインドを決める
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

  // BBの次のアクティブプレイヤーを探す
  const firstToAct = findNextWithChips(bbIdx);
  s.currentPlayerIndex = firstToAct !== bbIdx ? firstToAct : findNextWithChips(firstToAct);

  return s;
}

function countActivePlayers(state) {
  return state.players.filter(p => p.status === "active").length;
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

function generateRandomName() {
  const adjectives = ['Lucky', 'Royal', 'Wild', 'Cool', 'Swift', 'Ace', 'King', 'Queen', 'Jack', 'Brave'];
  const nouns = ['Shark', 'Tiger', 'Eagle', 'Wolf', 'Fox', 'Bear', 'Lion', 'Hawk', 'Ace', 'Pro'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

// Test framework
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

// ========== TESTS ==========

console.log('\n=== Poker Game Logic Tests ===\n');

// Test: initGame
test('initGame creates correct number of players', () => {
  const state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 1000);
  assertEqual(state.players.length, 3);
});

test('initGame sets correct initial chips', () => {
  const state = initGame(['Alice', 'Bob'], 10, 20, 500);
  assertEqual(state.players[0].chips, 500);
  assertEqual(state.players[1].chips, 500);
});

test('initGame sets correct blinds', () => {
  const state = initGame(['Alice', 'Bob'], 10, 20);
  assertEqual(state.smallBlind, 10);
  assertEqual(state.bigBlind, 20);
});

// Test: startHand
test('startHand sets phase to preflop', () => {
  let state = initGame(['Alice', 'Bob'], 10, 20, 1000);
  state = startHand(state);
  assertEqual(state.phase, 'preflop');
});

test('startHand posts blinds correctly', () => {
  let state = initGame(['Alice', 'Bob'], 10, 20, 1000);
  state = startHand(state);
  // In heads-up, dealer is SB
  assertEqual(state.players[0].chips, 990); // SB
  assertEqual(state.players[1].chips, 980); // BB
});

test('startHand sets isHandActive to true', () => {
  let state = initGame(['Alice', 'Bob'], 10, 20, 1000);
  state = startHand(state);
  assertTrue(state.isHandActive);
});

// Test: Players with 0 chips are marked as "out"
test('startHand marks players with 0 chips as out', () => {
  let state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 1000);
  state.players[1].chips = 0; // Bob has no chips
  state = startHand(state);
  assertEqual(state.players[1].status, 'out');
  assertEqual(state.players[0].status, 'active');
  assertEqual(state.players[2].status, 'active');
});

// Test: Game ends when only one player has chips
test('startHand ends game when only 1 player has chips', () => {
  let state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 1000);
  state.players[1].chips = 0;
  state.players[2].chips = 0;
  state = startHand(state);
  assertEqual(state.phase, 'finished');
  assertEqual(state.isHandActive, false);
});

// Test: countActivePlayers
test('countActivePlayers returns correct count', () => {
  let state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 1000);
  state = startHand(state);
  assertEqual(countActivePlayers(state), 3);
});

// Test: distributePot
test('distributePot gives all chips to single winner', () => {
  let state = initGame(['Alice', 'Bob'], 10, 20, 1000);
  state = startHand(state);
  state.pots = [{ amount: 100, eligiblePlayerIds: ['player_0', 'player_1'] }];
  state = distributePot(state, ['player_0']);
  assertEqual(state.players[0].chips, 1090); // 990 + 100
});

test('distributePot splits pot between winners', () => {
  let state = initGame(['Alice', 'Bob', 'Charlie'], 10, 20, 1000);
  state = startHand(state);
  state.pots = [{ amount: 100, eligiblePlayerIds: ['player_0', 'player_1', 'player_2'] }];
  state = distributePot(state, ['player_0', 'player_1']);
  // 100 / 2 = 50 each
  assertTrue(state.players[0].chips >= 1040); // At least 990 + 50
  assertTrue(state.players[1].chips >= 1030); // At least 980 + 50
});

// Test: generateRandomName
test('generateRandomName returns a string', () => {
  const name = generateRandomName();
  assertEqual(typeof name, 'string');
});

test('generateRandomName returns non-empty string', () => {
  const name = generateRandomName();
  assertTrue(name.length > 0, 'Name should not be empty');
});

test('generateRandomName includes a number', () => {
  const name = generateRandomName();
  assertTrue(/\d/.test(name), 'Name should include a number');
});

// Test: Blind posting with all-in
test('postBlind handles all-in when chips < blind', () => {
  let state = initGame(['Alice', 'Bob'], 10, 20, 15);
  state = startHand(state);
  // Alice (SB=10): 15 - 10 = 5 chips left
  // Bob (BB=20): Has 15, posts 15, goes all-in
  assertEqual(state.players[0].chips, 5);
  assertEqual(state.players[1].chips, 0);
  assertEqual(state.players[1].status, 'allIn');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  process.exit(1);
}
