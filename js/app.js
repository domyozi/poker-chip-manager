/**
 * app.js
 * Application state, UI, network, and event handlers
 */

// ═══════════════════════════════════════════════════════════════
// SECTION: Global Variables
// ═══════════════════════════════════════════════════════════════

const APP_VERSION = "v0.8.0";
let displayMode = localStorage.getItem('pokerDisplayMode') || 'chips';
let actionCounter = 0;

function newActionId() {
  return `act_${Date.now()}_${actionCounter++}`;
}

function getBigBlindValue() {
  return gameState?.bigBlind
    || parseInt(document.getElementById('bb-input')?.value || '0', 10)
    || 20;
}

function formatBB(amount) {
  const bb = getBigBlindValue();
  if (!bb) return '0';
  const value = amount / bb;
  const rounded = Math.abs(value - Math.round(value)) < 0.01
    ? Math.round(value)
    : Math.round(value * 10) / 10;
  return String(rounded);
}

function formatAmount(amount) {
  if (displayMode === 'bb') return `${formatBB(amount)}BB`;
  return amount.toLocaleString();
}

function applyDisplayMode(mode) {
  displayMode = mode;
  localStorage.setItem('pokerDisplayMode', mode);
  const toggleBtn = document.getElementById('menu-display-toggle');
  if (toggleBtn) toggleBtn.textContent = `表記切替: ${displayMode === 'bb' ? 'BB' : 'CHIP'}`;
  render();
}

// ─── FX helpers ────────────────────────────────
let fxAudioCtx = null;
let fxAudioUnlocked = false;
function getFxAudioCtx() {
  if (!fxAudioCtx) {
    fxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return fxAudioCtx;
}
function unlockFxAudio() {
  try {
    const ctx = getFxAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    fxAudioUnlocked = true;
  } catch (e) {}
}
document.addEventListener('click', unlockFxAudio, { once: true });
document.addEventListener('touchend', unlockFxAudio, { once: true });

function playTone({ freq = 660, duration = 0.18, type = 'sine', gain = 0.08 }) {
  try {
    const ctx = getFxAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (e) {}
}
function playPhaseChime() {
  if (!timerSettings.soundEnabled) return;
  playTone({ freq: 660, duration: 0.16, type: 'triangle', gain: 0.06 });
  setTimeout(() => playTone({ freq: 880, duration: 0.14, type: 'triangle', gain: 0.05 }), 80);
}
function playWinChime() {
  if (!timerSettings.soundEnabled) return;
  playTone({ freq: 523, duration: 0.2, type: 'sine', gain: 0.07 });
  setTimeout(() => playTone({ freq: 784, duration: 0.22, type: 'sine', gain: 0.06 }), 90);
}
function playAllInHit() {
  if (!timerSettings.soundEnabled) return;
  playTone({ freq: 196, duration: 0.12, type: 'square', gain: 0.05 });
}
function setTextWithBump(el, text) {
  if (!el) return;
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('value-bump');
  void el.offsetWidth;
  el.classList.add('value-bump');
}
function triggerPhasePulse() {
  const table = document.querySelector('.table-area');
  if (!table) return;
  table.classList.remove('phase-pulse');
  void table.offsetWidth;
  table.classList.add('phase-pulse');
}
function hasNewAllIn(prevState, nextState) {
  if (!prevState || !nextState) return false;
  return nextState.players.some((p, i) => p.status === 'allIn' && prevState.players[i]?.status !== 'allIn');
}


// ========================================================
// UI STATE & RENDERING
// ========================================================
let gameState = null;
let raiseValue = 0;           // 現在のレイズ額（絶対値）
let selectedWinners = [];     // showdown時の勝者選択
let isSplitMode = false;
let handHistory = [];         // ハンド履歴
let chipsBeforeHand = {};     // ハンド開始時のチップ
let lastCommunityCount = 0;
let lastPhase = null;
let lastPhaseFx = null;
let confirmLock = false;
let nextHandLock = false;
let perPlayerStackChips = {};
let winnerHighlightIds = [];
let winnerHighlightTimer = null;

// Timer state
let timerSettings = { duration: 0, soundEnabled: true };
let actionTimer = null;
let timeRemaining = 0;
let timerStartTime = 0;

// Tournament state
let tournamentSettings = { enabled: false, levelDuration: 15 };
let tournamentTimer = null;
let tournamentTimeRemaining = 0;
let currentBlindLevel = 1;

// Online sync (Supabase Realtime)
const SUPABASE_URL = "https://tpucsakhvzkincyvyscn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZU269gj6MzgeSra0gUeQ-A_I_9v2giq";
let supabaseClient = null;
let roomChannel = null;
let reconnectTimer = null;
let onlineState = {
  role: "local", // local | host | player
  roomCode: "",
  connected: false,
  displayName: "",
  seat: "",
  ready: false
};
let onlineReady = false;
let uiState = 'room'; // room | waiting | settings | playing

const COMMUNITY_SUITS = ['♠','♣','♥','♦','♠'];
const boundEvents = new WeakMap();
function bindOnce(el, type, handler, options) {
  if (!el) return;
  let map = boundEvents.get(el);
  if (!map) {
    map = {};
    boundEvents.set(el, map);
  }
  if (map[type]) return;
  map[type] = true;
  el.addEventListener(type, handler, options);
}

function debounce(fn, wait = 120) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function setupNumericInput(el) {
  if (!el) return;
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('pattern', '[0-9]*');
  el.setAttribute('enterkeyhint', 'done');
  const normalize = debounce(() => {
    const cleaned = (el.value || '').replace(/[^\d]/g, '');
    if (el.value !== cleaned) el.value = cleaned;
  }, 120);
  bindOnce(el, 'input', normalize);
  bindOnce(el, 'focus', () => el.select(), { passive: true });
}

// getPotTotal is defined in game-logic.js

const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
let debugPanel = null;
let debugLogEl = null;
function initDebugPanel() {
  if (!debugEnabled || debugPanel) return;
  debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel';
  debugPanel.innerHTML = `
    <header>
      <span>Debug</span>
      <span id="debug-toggle">▾</span>
    </header>
    <div class="content" id="debug-content"></div>
  `;
  document.body.appendChild(debugPanel);
  debugLogEl = debugPanel.querySelector('#debug-content');
  const header = debugPanel.querySelector('header');
  bindOnce(header, 'click', () => {
    debugPanel.classList.toggle('collapsed');
  });
}
function debugLog(msg) {
  if (!debugEnabled) return;
  if (!debugPanel) initDebugPanel();
  if (!debugLogEl) return;
  const line = document.createElement('div');
  line.textContent = msg;
  debugLogEl.appendChild(line);
  debugLogEl.scrollTop = debugLogEl.scrollHeight;
}

function initSupabase() {
  if (!window.supabase || supabaseClient) return;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function updatePresence(extra = {}) {
  if (!roomChannel) return;
  const payload = {
    role: onlineState.role,
    name: onlineState.displayName,
    joinedAt: onlineState.joinedAt || Date.now(),
    seat: onlineState.seat || "",
    ready: !!onlineState.ready,
    ...extra
  };
  onlineState.joinedAt = payload.joinedAt;
  roomChannel.track(payload);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!onlineState.roomCode || onlineState.role === 'local') return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    const role = onlineState.role;
    const code = onlineState.roomCode;
    await joinRoom(role, code);
  }, 1500);
}

function setUiState(state) {
  uiState = state;
  const screenMap = {
    room: 'room-screen',
    waiting: 'waiting-screen',
    settings: 'settings-screen',
    playing: 'game-screen'
  };
  const activeScreenId = screenMap[state];
  const activeEl = document.activeElement;
  if (activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur();
  }
  const screens = Object.values(screenMap);
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', id !== activeScreenId);
  });
  const activeScreen = document.getElementById(activeScreenId);
  if (activeScreen) {
    activeScreen.scrollTop = 0;
  }
  window.scrollTo(0, 0);
  if (state !== 'playing') {
    document.getElementById('showdown-overlay').classList.remove('visible');
    document.getElementById('next-hand-overlay').classList.remove('visible');
    document.getElementById('fold-confirm-overlay').classList.remove('visible');
  }
  if (state === 'waiting' || state === 'settings') {
    updateParticipantList();
  }
  if (state === 'settings') {
    updateSettingsPanels();
  }
  updateHeaderMenuVisibility();
  updatePlayerBadge();
}

function updateHeaderMenuVisibility() {
  const menuBtn = document.getElementById('menu-btn');
  if (!menuBtn) return;
  // local, hostは表示、playerのみ非表示
  const show = onlineState.role === 'local' || onlineState.role === 'host';
  menuBtn.style.display = show ? 'inline-flex' : 'none';
}

function updatePlayerBadge() {
  const nameEl = document.getElementById('player-name-tag');
  const roleEl = document.getElementById('player-role-tag');
  if (!nameEl || !roleEl) return;
  const name = onlineState.displayName || '—';
  const role = onlineState.role === 'host' ? 'HOST' : onlineState.role === 'player' ? 'PLAYER' : 'LOCAL';
  nameEl.textContent = name;
  roleEl.textContent = role;
  roleEl.classList.toggle('host', onlineState.role === 'host');
  roleEl.classList.toggle('player', onlineState.role !== 'host');
}

function setRoomStatus(text) {
  const el = document.getElementById('room-status');
  if (el) el.textContent = text;
}

function updateConnectionIndicator(status) {
  const indicator = document.getElementById('connection-indicator');
  if (!indicator) return;
  const dot = indicator.querySelector('.connection-dot');
  const text = indicator.querySelector('.connection-text');

  indicator.classList.remove('disconnected', 'reconnecting');

  if (status === 'connected' || status === 'SUBSCRIBED') {
    text.textContent = '接続中';
    indicator.title = '接続状態: 正常';
  } else if (status === 'reconnecting' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    indicator.classList.add('reconnecting');
    text.textContent = '再接続中';
    indicator.title = '接続状態: 再接続中...';
  } else if (status === 'disconnected' || status === 'CLOSED') {
    indicator.classList.add('disconnected');
    text.textContent = '切断';
    indicator.title = '接続状態: 切断されました';
  }
}

function setRoomControls(connected) {
  const leaveBtn = document.getElementById('room-leave-btn');
  if (leaveBtn) leaveBtn.style.display = connected ? 'inline-flex' : 'none';
}

function normalizeRoomCode(code) {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getPresenceList() {
  if (!roomChannel) return [];
  const presenceState = roomChannel.presenceState();
  const list = Object.values(presenceState).flat().map(p => ({ ...p, online: true }));
  return list.sort((a, b) => {
    const seatA = parseInt(a.seat || '0', 10) || 0;
    const seatB = parseInt(b.seat || '0', 10) || 0;
    if (seatA && seatB) return seatA - seatB;
    if (seatA && !seatB) return -1;
    if (!seatA && seatB) return 1;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });
}

function renderSeatRing(list) {
  const ring = document.getElementById('seat-ring');
  if (!ring) return;
  ring.innerHTML = '<div class="seat-center">TABLE</div>';
  const seats = 8;
  const cx = 50;
  const cy = 50;
  const rx = 42;
  const ry = 36;
  const used = new Map();
  list.forEach(p => {
    if (p.seat) used.set(String(p.seat), p);
  });
  for (let i = 1; i <= seats; i++) {
    const angle = ((i - 1) / seats) * 2 * Math.PI - Math.PI / 2;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    const seat = document.createElement('button');
    seat.className = 'seat-node';
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;
    seat.style.transform = 'translate(-50%, -50%)';
    const occupant = used.get(String(i));
    if (occupant) {
      seat.classList.add('taken');
      seat.innerHTML = `<div>${occupant.name || 'Guest'}</div><div class="seat-label">Seat ${i}</div>`;
      if (occupant.name === onlineState.displayName) {
        seat.classList.remove('taken');
        seat.classList.add('active');
      }
    } else {
      seat.innerHTML = `<div>Seat ${i}</div>`;
    }
    seat.dataset.seat = String(i);
    seat.addEventListener('click', () => {
      if (occupant && occupant.name !== onlineState.displayName) return;
      onlineState.seat = String(i);
      onlineState.ready = onlineState.role === 'host' ? true : false;
      updatePresence({ seat: onlineState.seat, ready: onlineState.ready });
      updateParticipantList();
    });
    ring.appendChild(seat);
  }
}

function updateParticipantList() {
  const list = getPresenceList();
  const el = document.getElementById('participant-list');
  const summaryEl = document.getElementById('participant-summary');
  const roomCodeDisplay = document.getElementById('room-code-display');
  if (roomCodeDisplay) roomCodeDisplay.textContent = onlineState.roomCode || '—';
  if (el) {
    el.innerHTML = '';
    list.forEach(p => {
      const item = document.createElement('div');
      const isSelf = p.name === onlineState.displayName;
      item.className = 'participant-item' + (isSelf ? ' self' : '');
      item.innerHTML = `
        <div>
          <div class="participant-name">${p.name || 'Guest'}${isSelf ? ' (あなた)' : ''} ${p.seat ? `• Seat ${p.seat}` : ''}</div>
          <div class="participant-meta">${p.online ? 'ONLINE' : 'OFFLINE'}</div>
        </div>
        <div>
          <div class="participant-role ${p.role || 'player'}">${p.role || 'player'}</div>
          <div class="participant-ready ${p.ready ? 'ready' : ''}">${p.ready ? 'READY' : 'NOT READY'}</div>
        </div>
      `;
      el.appendChild(item);
    });
  }
  if (summaryEl) {
    summaryEl.innerHTML = '';
    list.forEach(p => {
      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `
        <div class="participant-name">${p.name || 'Guest'} ${p.seat ? `• Seat ${p.seat}` : ''}</div>
        <div class="participant-role ${p.role || 'player'}">${p.role || 'player'}</div>
      `;
      summaryEl.appendChild(item);
    });
  }

  const hostControls = document.getElementById('waiting-host-controls');
  const hostStatus = document.getElementById('waiting-host-status');
  const startBtn = document.getElementById('waiting-start-btn');
  const guestControls = document.getElementById('waiting-guest-controls');
  if (onlineState.role === 'host' && hostControls) {
    hostControls.style.display = 'block';
    const canStart = list.length >= 2 && list.every(p => p.role === 'host' ? !!p.seat : p.ready);
    if (startBtn) startBtn.disabled = !canStart;
    if (hostStatus) hostStatus.textContent = canStart ? '全員準備OK。設定へ進めます' : '全員の準備完了を待っています';
    if (guestControls) guestControls.style.display = 'none';
  } else if (guestControls) {
    guestControls.style.display = 'block';
    if (hostControls) hostControls.style.display = 'none';
  }

  renderSeatRing(list);
  const readyBtn = document.getElementById('ready-toggle-btn');
  const seatHelp = document.getElementById('seat-help-text');
  const stepSeat = document.getElementById('step-seat');
  const stepReady = document.getElementById('step-ready');
  const seatConflict = list.some(p => p.seat && p.seat === onlineState.seat && p.name !== onlineState.displayName);
  if (seatConflict) {
    onlineState.seat = '';
    onlineState.ready = false;
    updatePresence({ seat: "", ready: false });
  }

  // Update step guide
  if (stepSeat && stepReady) {
    stepSeat.classList.remove('active', 'done');
    stepReady.classList.remove('active', 'done');
    stepReady.style.display = onlineState.role === 'host' ? 'none' : 'flex';
    if (!onlineState.seat) {
      stepSeat.classList.add('active');
    } else if (!(onlineState.role === 'host' ? !!onlineState.seat : onlineState.ready)) {
      stepSeat.classList.add('done');
      stepReady.classList.add('active');
    } else {
      stepSeat.classList.add('done');
      stepReady.classList.add('done');
    }
  }

  const effectiveReady = onlineState.role === 'host' ? !!onlineState.seat : onlineState.ready;
  if (readyBtn) {
    readyBtn.style.display = onlineState.role === 'host' ? 'none' : 'inline-flex';
    readyBtn.classList.toggle('on', onlineState.ready);
    readyBtn.textContent = onlineState.ready ? '✓ READY' : 'READY';
    readyBtn.disabled = !onlineState.seat;
  }
  if (seatHelp) {
    if (!onlineState.seat) {
      seatHelp.textContent = '👆 まず空席をタップしてね';
    } else if (!effectiveReady) {
      seatHelp.textContent = `Seat ${onlineState.seat} を選択中 → READYを押そう！`;
    } else {
      seatHelp.textContent = onlineState.role === 'host'
        ? '✓ ホスト準備完了。参加者のREADYを待っています'
        : '✓ 準備完了！ホストの開始を待っています';
    }
  }
}

async function leaveRoom() {
  if (roomChannel) {
    try { await roomChannel.untrack?.(); } catch (e) {}
    try { await roomChannel.unsubscribe(); } catch (e) {}
    roomChannel = null;
  }
  onlineState = {
    role: "local",
    roomCode: "",
    connected: false,
    displayName: onlineState.displayName,
    seat: "",
    ready: false,
    joinedAt: 0
  };
  gameState = null;
  stopTournamentTimer();
  stopActionTimer();
  onlineReady = false;
  setRoomControls(false);
  setRoomStatus('ローカルモード');
  setUiState('room');
  updatePlayerBadge();
}

async function createRoomWithUniqueCode(maxAttempts = 5) {
  initSupabase();
  if (!supabaseClient) return;

  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRoomCode();
    const ok = await joinRoom("host", code, true);
    if (ok) {
      const input = document.getElementById('room-code-input');
      if (input) input.value = code;
      return true;
    }
  }
  setRoomStatus('ルーム作成に失敗しました');
  return false;
}

async function joinRoom(role, code, isAuto = false) {
  initSupabase();
  if (!supabaseClient) return false;

  if (!onlineState.displayName) {
    if (!isAuto) setRoomStatus('名前を入力してください');
    return false;
  }

  const roomCode = normalizeRoomCode(code);
  if (!roomCode) {
    if (!isAuto) setRoomStatus('コードを入力してください');
    return false;
  }

  if (roomChannel) {
    await leaveRoom();
  }

  onlineState = {
    role,
    roomCode,
    connected: false,
    displayName: onlineState.displayName,
    seat: onlineState.seat,
    ready: onlineState.ready,
    joinedAt: onlineState.joinedAt
  };
  setRoomStatus(`接続中: ${roomCode}`);

  const channelName = `room_${roomCode}`;
  roomChannel = supabaseClient.channel(channelName, {
    config: { presence: { key: `user_${Date.now()}_${Math.random().toString(16).slice(2)}` } }
  });

  roomChannel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = roomChannel.presenceState();
      const list = Object.values(presenceState).flat();
      const hosts = list.filter(p => p.role === 'host');
      const nameDupes = list.filter(p => p.name === onlineState.displayName);
      if (nameDupes.length > 1) {
        leaveRoom();
        setRoomStatus('同じ名前の参加者がいます');
        return;
      }
      if (list.length > 8 && onlineState.role !== 'host') {
        leaveRoom();
        setRoomStatus('満席です');
        return;
      }
      if (onlineState.role !== 'host' && hosts.length === 0 && onlineReady) {
        leaveRoom();
        setRoomStatus('ホストが退出しました');
        return;
      }
      if (onlineState.role === 'host') {
        // If another host already exists, back out and let caller retry
        if (hosts.length > 1) {
          leaveRoom();
          if (!isAuto) setRoomStatus('既にホストがいます');
          return;
        }
        onlineReady = true;
        setRoomStatus(`ホスト中: ${roomCode}`);
        broadcastState();
        updateParticipantList();
      } else {
        onlineReady = true;
        setRoomStatus(`参加中: ${roomCode}`);
        requestState();
        updateParticipantList();
      }
    })
    .on('presence', { event: 'join' }, () => {
      updateParticipantList();
    })
    .on('presence', { event: 'leave' }, () => {
      updateParticipantList();
    })
    .on('broadcast', { event: 'state-sync' }, payload => {
      if (onlineState.role === 'host') return;
      if (!payload?.payload?.state) return;
      gameState = payload.payload.state;
      localPendingActionKey = null;
      if (gameState?.isHandActive) {
        document.getElementById('next-hand-overlay').classList.remove('visible');
      }
      render();
      if (gameState.isHandActive) startActionTimer();
    })
    .on('broadcast', { event: 'ui-phase' }, payload => {
      const phase = payload?.payload?.phase;
      if (!phase) return;
      setUiState(phase);
      if (phase === 'settings') updateParticipantList();
    })
    .on('broadcast', { event: 'start-game' }, payload => {
      if (onlineState.role === 'host') return;
      const settings = payload?.payload?.settings;
      const state = payload?.payload?.state;
      if (settings) applySettings(settings);
      if (state) gameState = state;
      setUiState('playing');
      const tournamentBar = document.getElementById('tournament-bar');
      if (tournamentSettings.enabled) {
        tournamentBar.style.display = 'flex';
        tournamentTimeRemaining = tournamentSettings.levelDuration * 60;
        updateTournamentDisplay();
      } else {
        tournamentBar.style.display = 'none';
      }
      render();
      if (gameState?.isHandActive) startActionTimer();
    })
    .on('broadcast', { event: 'state-request' }, () => {
      if (onlineState.role === 'host') broadcastState();
    })
    .on('broadcast', { event: 'action-request' }, payload => {
      if (onlineState.role !== 'host') return;
      const { type, amount } = payload?.payload || {};
      if (!type) return;
      applyRemoteAction(type, amount || 0);
    })
    .on('broadcast', { event: 'showdown-resolved' }, payload => {
      if (onlineState.role === 'host') return;
      const winnerIds = payload?.payload?.winnerIds || [];
      if (!gameState || winnerIds.length === 0) return;
      const totalPot = getPotTotal(gameState);
      const per = Math.floor(totalPot / winnerIds.length);
      const rem = totalPot - per * winnerIds.length;
      const winners = winnerIds.map(id => {
        const p = gameState.players.find(pl => pl.id === id);
        return { name: p?.name || '—', icon: p?.icon || '' };
      });
      gameState = distributePot(gameState, winnerIds);
      render();
      setWinnerHighlight(winnerIds);
      animatePotToWinners(winnerIds);
      playWinChime();
      let gainText = '';
      if (winnerIds.length === 1) {
        gainText = `+${totalPot.toLocaleString()} チップ`;
      } else {
        gainText = rem > 0
          ? `各 +${per.toLocaleString()} / 先頭 +${(per + rem).toLocaleString()} チップ`
          : `各 +${per.toLocaleString()} チップ`;
      }
      setTimeout(() => showNextHand(winners, gainText), 220);
    })
    .on('broadcast', { event: 'next-hand-request' }, () => {
      if (onlineState.role !== 'host') return;
      advanceToNextHandAndBroadcast();
    })
    .subscribe(async status => {
      updateConnectionIndicator(status);
      if (status === 'SUBSCRIBED') {
        updatePresence({ joinedAt: Date.now() });
        onlineState.connected = true;
        setRoomControls(true);
        updateParticipantList();
        hideDisconnectDialog();
        setRoomStatus(`${onlineState.role === 'host' ? 'ホスト中' : '参加中'}: ${onlineState.roomCode}`);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onlineState.connected = false;
        setRoomStatus('再接続中...');
        showDisconnectDialog();
        scheduleReconnect();
      }
      if (status === 'CLOSED') {
        onlineState.connected = false;
        setRoomStatus('接続が終了しました');
      }
    });

  return true;
}

function requestState() {
  if (!roomChannel) return;
  roomChannel.send({ type: 'broadcast', event: 'state-request', payload: {} });
}

function broadcastState() {
  if (!roomChannel || onlineState.role !== 'host') return;
  if (!gameState) return;
  roomChannel.send({ type: 'broadcast', event: 'state-sync', payload: { state: gameState } });
}

function sendActionRequest(type, amount) {
  if (!roomChannel) return;
  roomChannel.send({ type: 'broadcast', event: 'action-request', payload: { type, amount } });
}

function applyRemoteAction(type, amount) {
  const prevState = gameState;
  const result = processAction(gameState, type, amount);
  if (result.error) { console.warn(result.error); actionLock = false; return; }
  gameState = result;
  if (hasNewAllIn(prevState, gameState)) playAllInHit();
  render();
  if (gameState.isHandActive) {
    startActionTimer();
  }
  broadcastState();
}

// ─── TIMER FUNCTIONS ─────────────────────────────
function startActionTimer() {
  stopActionTimer();
  if (timerSettings.duration === 0) return; // 無制限
  if (onlineState.role === 'player') {
    if (!gameState) return;
    const actor = gameState.players[gameState.currentPlayerIndex];
    if (!actor || actor.name !== onlineState.displayName) return;
  }

  timeRemaining = timerSettings.duration;
  timerStartTime = Date.now();
  updateTimerDisplay();

  actionTimer = setInterval(() => {
    const elapsed = (Date.now() - timerStartTime) / 1000;
    timeRemaining = Math.max(0, timerSettings.duration - elapsed);

    updateTimerDisplay();

    // 残り5秒で警告音
    if (timerSettings.soundEnabled && Math.ceil(timeRemaining) === 5) {
      playTimerWarning();
    }

    if (timeRemaining <= 0) {
      handleTimeOut();
    }
  }, 100);
}

function stopActionTimer() {
  if (actionTimer) {
    clearInterval(actionTimer);
    actionTimer = null;
  }
  timeRemaining = 0;
}

function updateTimerDisplay() {
  const ring = document.querySelector('.player-card.is-actor .timer-ring .progress');
  const text = document.querySelector('.player-card.is-actor .timer-text');
  if (!ring || !text) return;

  const pct = timerSettings.duration > 0 ? timeRemaining / timerSettings.duration : 1;
  const circumference = 2 * Math.PI * 28;
  ring.style.strokeDashoffset = circumference * (1 - pct);

  const secs = Math.ceil(timeRemaining);
  text.textContent = `0:${secs.toString().padStart(2, '0')}`;

  // Color states
  ring.classList.remove('warning', 'danger');
  text.classList.remove('warning', 'danger');
  if (secs <= 5) {
    ring.classList.add('danger');
    text.classList.add('danger');
  } else if (secs <= 10) {
    ring.classList.add('warning');
    text.classList.add('warning');
  }
}

function handleTimeOut() {
  stopActionTimer();
  if (!gameState || !gameState.isHandActive) return;

  const actor = gameState.players[gameState.currentPlayerIndex];
  if (actor.status !== 'active') return;

  // Play timeout sound
  if (timerSettings.soundEnabled) playTimeoutSound();

  // Auto action: check if possible, otherwise fold
  const callAmt = gameState.currentMaxBet - actor.currentBet;
  if (callAmt === 0) {
    doAction('check');
  } else {
    doAction('fold');
  }
}

function playTimerWarning() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

function playTimeoutSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// ─── TOURNAMENT FUNCTIONS ────────────────────────
function startTournamentTimer() {
  stopTournamentTimer();
  if (!tournamentSettings.enabled) return;
  if (onlineState.role === 'player') return;

  tournamentTimeRemaining = tournamentSettings.levelDuration * 60;
  updateTournamentDisplay();

  tournamentTimer = setInterval(() => {
    tournamentTimeRemaining--;
    updateTournamentDisplay();

    if (tournamentTimeRemaining <= 0) {
      advanceBlindLevel();
    }
  }, 1000);
}

function stopTournamentTimer() {
  if (tournamentTimer) {
    clearInterval(tournamentTimer);
    tournamentTimer = null;
  }
}

function updateTournamentDisplay() {
  const bar = document.getElementById('tournament-bar');
  if (!bar || !tournamentSettings.enabled) return;

  const mins = Math.floor(tournamentTimeRemaining / 60);
  const secs = tournamentTimeRemaining % 60;

  bar.querySelector('.next-level span').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;
  bar.querySelector('.level').textContent = `Level ${currentBlindLevel}`;
  bar.querySelector('.blinds').textContent =
    `${gameState.smallBlind} / ${gameState.bigBlind}`;
}

function advanceBlindLevel() {
  if (!gameState) return;
  currentBlindLevel++;
  gameState.smallBlind *= 2;
  gameState.bigBlind *= 2;
  tournamentTimeRemaining = tournamentSettings.levelDuration * 60;
  updateTournamentDisplay();
  if (onlineState.role === 'host') {
    broadcastState();
  }

  // Play level up sound
  if (timerSettings.soundEnabled) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.value = 0.15;
      osc.start();
      setTimeout(() => { osc.frequency.value = 880; }, 150);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }
}

function collectSettingsFromForm() {
  return {
    smallBlind: parseInt(document.getElementById('sb-input').value) || 10,
    bigBlind: parseInt(document.getElementById('bb-input').value) || 20,
    initialChips: parseInt(document.getElementById('initial-chips-input').value) || 1000,
    timerDuration: parseInt(document.getElementById('timer-select').value) || 0,
    soundEnabled: document.getElementById('timer-sound-toggle').checked,
    tournamentEnabled: document.getElementById('tournament-mode-toggle').checked,
    levelDuration: parseInt(document.getElementById('blind-level-select').value) || 15
  };
}

function applySettings(settings) {
  timerSettings.duration = settings.timerDuration;
  timerSettings.soundEnabled = settings.soundEnabled;
  tournamentSettings.enabled = settings.tournamentEnabled;
  tournamentSettings.levelDuration = settings.levelDuration;
  currentBlindLevel = 1;
}

function getLocalPlayers() {
  const rows = document.querySelectorAll('.player-row');
  const players = [];
  rows.forEach((row, i) => {
    const input = row.querySelector('.player-name-input');
    const name = input ? input.value.trim() : '';
    const icon = row.dataset.icon || '';
    if (!name && !icon) return;
    const finalName = name || icon || `プレイヤー${i + 1}`;
    players.push({ name: finalName, icon });
  });
  return players;
}

function getLocalPlayerFormData() {
  const rows = document.querySelectorAll('.player-row');
  const data = [];
  rows.forEach(row => {
    const input = row.querySelector('.player-name-input');
    const name = input ? input.value.trim() : '';
    const icon = row.dataset.icon || '';
    if (!name && !icon) return;
    data.push({ name, icon });
  });
  return data;
}

function getOnlinePlayerNames() {
  const list = getPresenceList();
  return list.map((p, i) => p.name || `Player ${i + 1}`);
}

function getOnlinePlayers() {
  const list = getPresenceList();
  return list.map((p, i) => ({ name: p.name || `Player ${i + 1}`, icon: '' }));
}

function getPerPlayerStackEnabled() {
  const toggle = document.getElementById('per-player-stack-toggle');
  return !!toggle && toggle.checked;
}

function getPerPlayerStackInputs() {
  return Array.from(document.querySelectorAll('.stack-row input[data-index]'));
}

function renderPerPlayerStackList() {
  const listEl = document.getElementById('per-player-stack-list');
  if (!listEl) return;
  const enabled = getPerPlayerStackEnabled();
  listEl.style.display = enabled ? 'flex' : 'none';
  const initialChipsRow = document.getElementById('initial-chips-row');
  if (initialChipsRow) {
    initialChipsRow.style.display = enabled ? 'none' : 'flex';
  }
  if (!enabled) return;

  const settings = collectSettingsFromForm();
  const players = onlineState.role === 'host' ? getOnlinePlayers() : getLocalPlayers();
  listEl.innerHTML = '';
  const defaultChips = settings.initialChips;

  players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'stack-row';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.className = 'stack-input';
    input.dataset.index = String(i);
    const saved = perPlayerStackChips[i];
    input.value = String(saved || defaultChips);

    const bbDisplay = document.createElement('div');
    bbDisplay.className = 'stack-meta';
    const updateBBDisplay = () => {
      const chips = parseInt(input.value, 10);
      const validChips = Number.isFinite(chips) && chips >= 1 ? chips : defaultChips;
      const bb = settings.bigBlind > 0 ? Math.floor(validChips / settings.bigBlind) : 0;
      bbDisplay.textContent = `= ${bb.toLocaleString()} BB`;
      perPlayerStackChips[i] = validChips;
    };
    updateBBDisplay();
    input.addEventListener('input', updateBBDisplay);

    row.innerHTML = `<div class="stack-name">${p.name}</div>`;
    row.appendChild(input);
    row.appendChild(bbDisplay);
    listEl.appendChild(row);
  });
}

function updatePerPlayerBBDisplays() {
  const settings = collectSettingsFromForm();
  const rows = document.querySelectorAll('.stack-row');
  rows.forEach(row => {
    const input = row.querySelector('.stack-input');
    const bbDisplay = row.querySelector('.stack-meta');
    if (!input || !bbDisplay) return;
    const chips = parseInt(input.value, 10);
    const validChips = Number.isFinite(chips) && chips >= 1 ? chips : settings.initialChips;
    const bb = settings.bigBlind > 0 ? Math.floor(validChips / settings.bigBlind) : 0;
    bbDisplay.textContent = `= ${bb.toLocaleString()} BB`;
  });
}

function startGameWithPlayers(players, settings) {
  applySettings(settings);
  const perPlayerEnabled = getPerPlayerStackEnabled();
  const stackInputs = getPerPlayerStackInputs();
  const stacksByIndex = new Map();
  if (perPlayerEnabled) {
    stackInputs.forEach(input => {
      const idx = parseInt(input.dataset.index || '0', 10);
      const chips = parseInt(input.value, 10);
      const validChips = Number.isFinite(chips) && chips >= 1 ? chips : settings.initialChips;
      stacksByIndex.set(idx, validChips);
    });
  }
  const playersWithStacks = players.map((p, i) => ({
    ...p,
    startingChips: perPlayerEnabled ? (stacksByIndex.get(i) || settings.initialChips) : settings.initialChips
  }));
  if (onlineState.role === 'local' || (!roomChannel && onlineState.role !== 'player')) {
    onlineState.displayName = playersWithStacks[0]?.name || onlineState.displayName;
  }
  gameState = initGame(playersWithStacks, settings.smallBlind, settings.bigBlind, settings.initialChips);
  gameState.timerSettings = { ...timerSettings };
  gameState.tournamentSettings = { ...tournamentSettings };
  handHistory = [];
  gameState = startHand(gameState);
  saveChipsBeforeHand();

  setUiState('playing');

  const tournamentBar = document.getElementById('tournament-bar');
  if (tournamentSettings.enabled) {
    tournamentBar.style.display = 'flex';
    startTournamentTimer();
  } else {
    tournamentBar.style.display = 'none';
  }

  render();
  startActionTimer();
}

function updateSettingsPanels() {
  const hostPanel = document.getElementById('settings-host-panel');
  const guestPanel = document.getElementById('settings-guest-panel');
  const onlineSummary = document.getElementById('online-player-summary');
  const localSettings = document.getElementById('local-player-settings');
  const guestSummary = document.getElementById('guest-participant-summary');

  if (onlineState.role === 'player') {
    if (hostPanel) hostPanel.style.display = 'none';
    if (guestPanel) guestPanel.style.display = 'block';
    // ゲスト用に参加者リストを表示
    if (guestSummary) {
      const list = getPresenceList();
      guestSummary.innerHTML = '';
      list.forEach(p => {
        const item = document.createElement('div');
        const isSelf = p.name === onlineState.displayName;
        item.className = 'participant-item' + (isSelf ? ' self' : '');
        item.innerHTML = `
          <div class="participant-name">${p.name || 'Guest'}${isSelf ? ' (あなた)' : ''}</div>
          <div class="participant-role ${p.role || 'player'}">${p.role || 'player'}</div>
        `;
        guestSummary.appendChild(item);
      });
    }
  } else {
    if (hostPanel) hostPanel.style.display = 'block';
    if (guestPanel) guestPanel.style.display = 'none';
  }
  if (onlineSummary && localSettings) {
    const isOnlineHost = onlineState.role === 'host';
    onlineSummary.style.display = isOnlineHost ? 'block' : 'none';
    localSettings.style.display = isOnlineHost ? 'none' : 'block';
  }
  updateInitialChipsBB();
  renderPerPlayerStackList();
}

// Player positions (ellipse ring). index → {x%, y%}
function calcPositions(n) {
  const positions = [];
  const cx = 50, cy = 50;

  // 2人の場合: 上下に大きく離す
  if (n === 2) {
    positions.push({ x: cx, y: 10 });  // 上
    positions.push({ x: cx, y: 90 });  // 下
    return positions;
  }

  // 3-4人の場合: 広めの楕円
  if (n <= 4) {
    const rx = 44, ry = 42;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      positions.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle)
      });
    }
    return positions;
  }

  // 5人以上: 標準の楕円配置
  const rx = 42, ry = 40;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    positions.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle)
    });
  }
  return positions;
}

function renderPlayers() {
  const ring = document.getElementById('players-ring');
  ring.innerHTML = '';
  if (!gameState) return;

  const positions = calcPositions(gameState.players.length);

  gameState.players.forEach((player, idx) => {
    const pos = positions[idx];
    const isActor = idx === gameState.currentPlayerIndex && gameState.isHandActive && player.status === "active";
    const isDealer = idx === gameState.dealerIndex;
    const isFolded = player.status === "folded";
    const isAllIn = player.status === "allIn";
    const isWinner = winnerHighlightIds.includes(player.id);

    let classes = 'player-card';
    if (isActor) classes += ' is-actor';
    if (isFolded) classes += ' folded';
    if (isAllIn) classes += ' allin';
    if (isWinner) classes += ' is-winner';
    if (idx === 0) classes += ' seat-top';

    const initial = player.name ? player.name.charAt(0).toUpperCase() : '';
    const avatarSymbol = player.icon || initial || '?';
    const displayIcon = player.icon || '•';
    const showName = player.name && player.name !== player.icon;
    const hasBet = player.currentBet > 0;

    const card = document.createElement('div');
    card.className = classes;
    card.dataset.playerId = player.id;
    card.style.left = pos.x + '%';
    card.style.top = pos.y + '%';

    // Timer ring for active player (only if timer is enabled)
    const showTimer = isActor && timerSettings.duration > 0;
    const circumference = 2 * Math.PI * 28;
    const timerRingHtml = showTimer ? `
      <svg class="timer-ring" width="64" height="64" viewBox="0 0 64 64">
        <circle class="bg" cx="32" cy="32" r="28"/>
        <circle class="progress" cx="32" cy="32" r="28"
          style="stroke-dasharray: ${circumference}; stroke-dashoffset: 0"/>
      </svg>
      <div class="timer-text">0:${timerSettings.duration.toString().padStart(2, '0')}</div>
    ` : '';

    card.innerHTML = `
      <div class="allin-badge">ALL IN</div>
      <div class="avatar">
        ${timerRingHtml}
        ${isDealer ? '<div class="dealer-badge">D</div>' : ''}
        ${avatarSymbol}
        ${hasBet ? `<div class="bet-badge">${formatAmount(player.currentBet)}</div>` : ''}
      </div>
      <div class="info-line">
        <span class="player-icon${player.icon ? '' : ' is-empty'}" aria-hidden="true">${displayIcon}</span>
        <div class="name${showName ? '' : ' is-empty'}">${showName ? player.name : ''}</div>
        <div class="chips">${formatAmount(player.chips)}</div>
      </div>
    `;
    ring.appendChild(card);

    // Bet badge visibility
    if (hasBet) {
      setTimeout(() => {
        const badge = card.querySelector('.bet-badge');
        if (badge) {
          const dx = 50 - pos.x;
          const dy = 50 - pos.y;
          const mag = Math.hypot(dx, dy) || 1;
          const offset = 26;
          const ox = (dx / mag) * offset;
          const oy = (dy / mag) * offset;
          badge.style.opacity = '1';
          badge.style.transform = `translate(-50%, -50%) translate(${ox}px, ${oy}px)`;
        }
      }, 50);
    }
  });
}

function setWinnerHighlight(ids) {
  winnerHighlightIds = Array.isArray(ids) ? ids.slice() : [];
  if (winnerHighlightTimer) clearTimeout(winnerHighlightTimer);
  renderPlayers();
  winnerHighlightTimer = setTimeout(() => {
    winnerHighlightIds = [];
    renderPlayers();
  }, 3600);
}

function animatePotToWinners(winnerIds) {
  const pot = document.querySelector('.pot-center');
  if (!pot || !winnerIds || winnerIds.length === 0) return;
  const potRect = pot.getBoundingClientRect();
  const startX = potRect.left + potRect.width / 2;
  const startY = potRect.top + potRect.height / 2;
  const targets = winnerIds
    .map(id => document.querySelector(`.player-card[data-player-id="${id}"] .avatar`))
    .filter(Boolean)
    .slice(0, 3);
  if (targets.length === 0) return;

  targets.forEach((avatar, i) => {
    const rect = avatar.getBoundingClientRect();
    const endX = rect.left + rect.width / 2;
    const endY = rect.top + rect.height / 2;
    const flyer = document.createElement('div');
    flyer.className = 'pot-flyer';
    flyer.style.left = `${startX}px`;
    flyer.style.top = `${startY}px`;
    flyer.style.transform = 'translate(-50%, -50%)';
    flyer.style.opacity = '1';
    document.body.appendChild(flyer);
    const dx = endX - startX;
    const dy = endY - startY;
    setTimeout(() => {
      flyer.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`;
      flyer.style.opacity = '0';
    }, 40 + i * 40);
    flyer.addEventListener('transitionend', () => flyer.remove(), { once: true });
  });
}

function renderPot() {
  const total = (gameState.pots||[]).reduce((s, p) => s + p.amount, 0);
  const el = document.getElementById('pot-amount');
  const prev = parseInt(el.dataset.value || '0', 10) || 0;
  el.dataset.value = String(total);
  el.textContent = formatAmount(total);
  if (total !== prev && total > 0) {
    el.classList.remove('bump');
    void el.offsetWidth; // reflow
    el.classList.add('bump');
  }
}

function renderStatusBar() {
  if (!gameState) return;
  const actor = gameState.players[gameState.currentPlayerIndex];
  if (!actor) return;

  const potTotal = (gameState.pots||[]).reduce((s, p) => s + p.amount, 0);
  const toCall = Math.max(0, gameState.currentMaxBet - actor.currentBet);
  const minRaiseTo = gameState.currentMaxBet + gameState.lastRaiseSize;

  const potEl = document.getElementById('status-pot');
  const toCallEl = document.getElementById('status-to-call');
  const minRaiseEl = document.getElementById('status-min-raise');

  if (potEl) setTextWithBump(potEl, formatAmount(potTotal));
  if (toCallEl) {
    const toCallText = toCall === 0 ? 'FREE' : formatAmount(toCall);
    setTextWithBump(toCallEl, toCallText);
    toCallEl.classList.toggle('highlight', toCall === 0);
  }
  if (minRaiseEl) setTextWithBump(minRaiseEl, formatAmount(minRaiseTo));
}

function getCommunityCardCount(phase) {
  switch (phase) {
    case 'flop': return 3;
    case 'turn': return 4;
    case 'river': return 5;
    case 'showdown': return 5;
    default: return 0;
  }
}

function renderCommunityCards() {
  const container = document.getElementById('community-cards');
  if (!container) return;
  container.innerHTML = '';
  const count = gameState ? getCommunityCardCount(gameState.phase) : 0;
  const prevCount = lastCommunityCount;
  for (let i = 0; i < 5; i++) {
    const slot = document.createElement('div');
    slot.className = 'community-slot';
    if (i < count) {
      if (i >= prevCount) slot.classList.add('revealed');
      const img = document.createElement('img');
      img.src = 'img/trump.png';
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.style.display = 'none'; };
      slot.appendChild(img);
    } else {
      slot.classList.add('empty');
    }
    container.appendChild(slot);
  }
  lastCommunityCount = count;
}

function renderPhase() {
  const phase = gameState ? gameState.phase : 'preflop';
  document.getElementById('phase-label').textContent = phase.toUpperCase();

  const order = ['preflop','flop','turn','river'];
  const currentIdx = order.indexOf(phase);
  document.querySelectorAll('.phase-step').forEach((el, i) => {
    el.classList.remove('active','completed');
    if (i < currentIdx) el.classList.add('completed');
    else if (i === currentIdx) el.classList.add('active');
  });

  if (lastPhaseFx && lastPhaseFx !== phase) {
    triggerPhasePulse();
    playPhaseChime();
  }
  lastPhaseFx = phase;
}

function renderActionPanel() {
  const panel = document.getElementById('action-panel');
  const btnsEl = document.getElementById('action-btns');
  const lockMessage = document.getElementById('action-lock-message');
  const actorLabel = document.getElementById('actor-label');
  if (!panel || !btnsEl) return;
  btnsEl.innerHTML = '';

  if (!gameState || !gameState.isHandActive) {
    panel.classList.add('hidden');
    return;
  }

  const actorIdx = gameState.currentPlayerIndex;
  const actor = gameState.players[actorIdx];
  const turnKey = `${actor.id}:${gameState.currentMaxBet}:${gameState.phase}`;
  if (turnKey !== lastTurnKey) {
    lastTurnKey = turnKey;
    lastActionId = null;
  }
  const isLocalSession = onlineState.role === 'local' || (!roomChannel && onlineState.role !== 'player');
  const isMyTurn = isLocalSession || actor.name === onlineState.displayName;
  const hasPending = localPendingActionKey === turnKey;

  // アクティブなプレイヤーがいない場合（全員オールインまたはフォールド）
  if (actor.status !== 'active') {
    panel.classList.remove('hidden');
    panel.classList.add('locked');
    if (actorLabel) actorLabel.innerHTML = '次のフェーズを待っています...';
    if (lockMessage) lockMessage.style.display = 'none';
    return;
  }

  panel.classList.remove('hidden');
  panel.classList.remove('locked');
  if (lockMessage) lockMessage.style.display = 'none';

  // Actor label
  if (actorLabel) actorLabel.innerHTML = `<strong>${actor.name}</strong> のターンです`;

  if (!isMyTurn || hasPending) {
    panel.classList.add('locked');
    if (lockMessage) {
      lockMessage.style.display = 'block';
      lockMessage.innerHTML = 'あなたの番になるまでお待ちください';
    }
    return;
  }

  const callAmt = gameState.currentMaxBet - actor.currentBet;
  const canCheck = callAmt === 0;

  // Fold
  btnsEl.appendChild(makeActionBtn('btn-fold', 'FOLD', '—', () => handleFoldAttempt()));

  // Check or Call
  if (canCheck) {
    btnsEl.appendChild(makeActionBtn('btn-check', 'CHECK', formatAmount(0), () => doAction('check')));
  } else {
    const actualCall = Math.min(callAmt, actor.chips);
    const isAllInCall = actualCall >= actor.chips;
    btnsEl.appendChild(makeActionBtn('btn-call', 'CALL', isAllInCall ? 'ALL IN' : formatAmount(actualCall), () => doAction('call')));
  }

  // Raise (only if chips remain after a potential call)
  const minRaise = gameState.currentMaxBet + gameState.lastRaiseSize;
  const maxRaise = actor.chips + actor.currentBet;
  if (maxRaise >= minRaise) {
    setRaiseValue(minRaise);
    btnsEl.appendChild(makeActionBtn('btn-raise', 'RAISE', formatAmount(raiseValue), () => toggleRaiseArea()));
    setupRaiseSlider(minRaise, maxRaise);
  }

  // Hide raise area initially
  document.getElementById('raise-area').classList.remove('visible');
}

let actionProcessing = false;
function makeActionBtn(cls, label, sub, onClick) {
  const btn = document.createElement('button');
  btn.className = 'action-btn ' + cls;
  btn.innerHTML = `<span class="btn-label">${label}</span><span class="btn-sub">${sub}</span>`;

  // デバウンス処理で二重発火防止
  const handleClick = (e) => {
    e.preventDefault();
    if (actionProcessing) return;
    actionProcessing = true;
    setTimeout(() => { actionProcessing = false; }, 300);
    onClick();
  };

  btn.addEventListener('click', handleClick);
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleClick(e);
  });
  return btn;
}

let raiseMin = 0, raiseMax = 0;
let raiseMinTo = 0;
let actionLock = false;
let lastActionId = null;
let lastTurnKey = null;
let localPendingActionKey = null;
function setupRaiseSlider(min, max) {
  raiseMin = min;
  raiseMax = max;
  raiseMinTo = min;
  const slider = document.getElementById('raise-slider');
  slider.min = 0;
  slider.max = 100;
  slider.value = 0; // min position
  setRaiseValue(min);
  updateRaisePresets();
  updateRaiseMinLabel();
}

function setRaiseValue(value) {
  const clamped = Math.max(raiseMin, Math.min(raiseMax, Math.round(value)));
  raiseValue = clamped;
  const display = document.getElementById('raise-amount-display');
  if (display) setTextWithBump(display, formatAmount(raiseValue));
  const slider = document.getElementById('raise-slider');
  if (slider && raiseMax > raiseMin) {
    const pct = (raiseValue - raiseMin) / (raiseMax - raiseMin);
    slider.value = Math.round(pct * 100);
  }
  const raiseBtn = document.querySelector('.btn-raise .btn-sub');
  if (raiseBtn) setTextWithBump(raiseBtn, formatAmount(raiseValue));
  updateActivePreset();
  updateRaiseMinLabel();
  updateRaiseError();
}

function onRaiseSlide() {
  const slider = document.getElementById('raise-slider');
  const pct = parseInt(slider.value) / 100;
  setRaiseValue(Math.round(raiseMin + (raiseMax - raiseMin) * pct));
}

function updateRaisePresets() {
  const presetsEl = document.getElementById('raise-presets');
  if (!presetsEl || !gameState) return;
  presetsEl.innerHTML = '';
  const actor = gameState.players[gameState.currentPlayerIndex];
  const callAmt = gameState.currentMaxBet - actor.currentBet;
  const totalPot = getPotTotal(gameState);

  const addPreset = (label, targetValue, extraClass = '') => {
    const value = Math.max(raiseMin, Math.min(raiseMax, Math.round(targetValue)));
    const btn = document.createElement('button');
    btn.className = `raise-preset-btn${extraClass ? ' ' + extraClass : ''}`;
    btn.textContent = label;
    btn.dataset.amount = String(value);
    btn.addEventListener('click', () => setRaiseValue(value), { passive: true });
    presetsEl.appendChild(btn);
  };

  if (gameState.phase === 'preflop') {
    addPreset('2.5BB', gameState.bigBlind * 2.5);
    addPreset('3BB', gameState.bigBlind * 3);
    addPreset('5BB', gameState.bigBlind * 5);
  } else {
    const potFractions = [
      ['1/3 POT', 1 / 3],
      ['1/2 POT', 1 / 2],
      ['2/3 POT', 2 / 3],
      ['FULL POT', 1]
    ];
    potFractions.forEach(([label, frac]) => {
      const betSize = Math.max(1, Math.round(totalPot * frac));
      addPreset(label, actor.currentBet + callAmt + betSize);
    });
    [2, 3, 4].forEach(mult => {
      const betSize = Math.max(1, Math.round(totalPot * mult));
      addPreset(`x${mult}`, actor.currentBet + callAmt + betSize, 'is-multi');
    });
  }
  addPreset('ALL IN', actor.currentBet + actor.chips);
  updateActivePreset();
  updateRaiseMinLabel();
  updateRaiseError();
}

function updateRaiseMinLabel() {
  const el = document.getElementById('raise-min-label');
  if (!el || !gameState) return;
  const minRaiseTo = gameState.currentMaxBet + gameState.lastRaiseSize;
  raiseMinTo = minRaiseTo;
  setTextWithBump(el, `Min Raise: ${formatAmount(minRaiseTo)}`);
}

function updateInitialChipsBB() {
  const bb = parseInt(document.getElementById('bb-input')?.value || '0', 10) || 0;
  const chips = parseInt(document.getElementById('initial-chips-input')?.value || '0', 10) || 0;
  const el = document.getElementById('initial-chips-bb');
  if (!el) return;
  const bbValue = bb > 0 ? Math.floor(chips / bb) : 0;
  el.textContent = `初期チップ：${chips.toLocaleString()}（= ${bbValue} BB）`;
}

function updateRaiseError() {
  const el = document.getElementById('raise-error');
  if (!el || !gameState) return;
  const actor = gameState.players[gameState.currentPlayerIndex];
  const allInTo = actor.currentBet + actor.chips;
  if (raiseValue < raiseMinTo && raiseValue < allInTo) {
    el.style.display = 'block';
    el.textContent = `レイズは ${formatAmount(raiseMinTo)} 以上`;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function updateActivePreset() {
  const presetBtns = document.querySelectorAll('.raise-preset-btn');
  presetBtns.forEach(btn => {
    const amt = parseInt(btn.dataset.amount || '0', 10);
    btn.classList.toggle('active', amt === raiseValue);
  });
}

function toggleRaiseArea() {
  const area = document.getElementById('raise-area');
  if (area.classList.contains('visible')) {
    // Second tap → execute raise
    const actor = gameState?.players?.[gameState.currentPlayerIndex];
    const allInTo = actor ? actor.currentBet + actor.chips : raiseValue;
    if (raiseValue < raiseMinTo && raiseValue < allInTo) {
      updateRaiseError();
      return;
    }
    // Check if this is an all-in
    if (actor && raiseValue >= allInTo) {
      pendingAllInAction = { type: 'raise', amount: raiseValue };
      showAllInConfirm(actor.chips);
      return;
    }
    doAction('raise', raiseValue);
  } else {
    area.classList.add('visible');
    updateRaisePresets();
  }
}

let foldConfirmShown = false; // フォールド確認済みフラグ

function showFoldConfirm() {
  const overlay = document.getElementById('fold-confirm-overlay');
  overlay.classList.add('visible');
}

function hideFoldConfirm() {
  const overlay = document.getElementById('fold-confirm-overlay');
  overlay.classList.remove('visible');
}

// All-in confirmation
let pendingAllInAction = null;

function showAllInConfirm(chips) {
  const overlay = document.getElementById('allin-confirm-overlay');
  const message = document.getElementById('allin-confirm-message');
  message.textContent = `${formatAmount(chips)} チップをすべて賭けます。本当にオールインしますか？`;
  overlay.classList.add('visible');
}

function hideAllInConfirm(clearPending = true) {
  const overlay = document.getElementById('allin-confirm-overlay');
  overlay.classList.remove('visible');
  if (clearPending) pendingAllInAction = null;
}

function confirmAllIn() {
  const pending = pendingAllInAction;
  pendingAllInAction = null;
  hideAllInConfirm(false);
  if (pending) executeAction(pending.type, pending.amount);
}

function executeAction(type, amount) {
  // Direct action execution (bypasses all-in check)
  if (actionLock) return;
  if (onlineState.role === 'player') {
    if (gameState) {
      const actor = gameState.players[gameState.currentPlayerIndex];
      localPendingActionKey = `${actor.id}:${gameState.currentMaxBet}:${gameState.phase}`;
      renderActionPanel();
    }
    sendActionRequest(type, amount);
  } else {
    const result = processAction(gameState, type, amount);
    if (result.error) return;
    gameState = result;
    render();
    document.getElementById('raise-area').classList.remove('visible');
    startActionTimer();
  }
}

function handleFoldAttempt() {
  if (!gameState) return;
  const actor = gameState.players[gameState.currentPlayerIndex];
  const callAmt = gameState.currentMaxBet - actor.currentBet;

  // チェックできる状況で、まだ確認していない場合
  if (callAmt === 0 && !foldConfirmShown) {
    foldConfirmShown = true;
    showFoldConfirm();
    return;
  }

  // 確認済みまたはコールが必要な場合は直接フォールド
  doAction('fold');
}

function handlePhaseTransition() {
  if (!gameState) { lastPhase = null; return; }
  if (gameState.phase === 'showdown' && lastPhase !== 'showdown') {
    stopActionTimer();
    showShowdown();
  }
  if (gameState.phase !== 'showdown' && lastPhase === 'showdown') {
    document.getElementById('showdown-overlay').classList.remove('visible');
  }
  lastPhase = gameState.phase;
}

function doAction(type, amount = 0) {
  if (actionLock) return;
  if (onlineState.role === 'player') {
    if (gameState) {
      const actor = gameState.players[gameState.currentPlayerIndex];
      localPendingActionKey = `${actor.id}:${gameState.currentMaxBet}:${gameState.phase}`;
      renderActionPanel();
    }
    sendActionRequest(type, amount);
    return;
  }
  if (!gameState) return;
  const prevState = gameState;
  const actorId = gameState.players[gameState.currentPlayerIndex]?.id;
  const actionKey = `${actorId}:${gameState.currentPlayerIndex}:${gameState.currentMaxBet}:${gameState.phase}`;
  if (lastActionId === actionKey) return;
  actionLock = true;
  const result = processAction(gameState, type, amount);
  if (result.error) { console.warn(result.error); return; }
  gameState = result;
  if (hasNewAllIn(prevState, gameState)) playAllInHit();
  lastActionId = actionKey;

  // Hide raise area after action
  document.getElementById('raise-area').classList.remove('visible');

  render();

  if (gameState.isHandActive) {
    // Restart timer for next player
    startActionTimer();
  }
  if (onlineState.role === 'host') {
    broadcastState();
  }
  actionLock = false;
}

function render() {
  renderPlayers();
  renderPot();
  renderStatusBar();
  renderCommunityCards();
  renderPhase();
  renderActionPanel();
  handlePhaseTransition();
}

// ─── SHOWDOWN ─────────────────────────────────
function showShowdown() {
  const total = (gameState.pots||[]).reduce((s,p) => s + p.amount, 0);
  document.getElementById('showdown-pot-amount').textContent = formatAmount(total);
  document.getElementById('next-hand-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');

  if (onlineState.role === 'player') {
    const card = document.querySelector('#showdown-overlay .showdown-card');
    if (card) {
      card.innerHTML = `
        <div class="showdown-title">ホストが結果を確定しています</div>
        <div class="showdown-pot">${formatAmount(total)}</div>
        <div class="showdown-pot-label">TOTAL POT</div>
        <div class="waiting-subtext" style="margin-top:12px;">しばらくお待ちください</div>
      `;
    }
    document.getElementById('showdown-overlay').classList.add('visible');
    return;
  }

  // Eligible players (not folded AND not out)
  const eligible = gameState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
  const selectEl = document.getElementById('winner-select');
  selectEl.innerHTML = '';
  selectedWinners = [];
  isSplitMode = false;
  const splitToggle = document.getElementById('split-toggle');
  const splitWrap = splitToggle ? splitToggle.closest('.split-toggle') : null;
  const confirmBtn = document.getElementById('confirm-winner-btn');
  if (splitToggle) splitToggle.classList.remove('on');
  if (splitWrap) splitWrap.style.display = eligible.length >= 2 ? 'flex' : 'none';
  if (confirmBtn) confirmBtn.disabled = true;

  // 1人しかいない場合は自動選択
  if (eligible.length === 1) {
    selectedWinners = [eligible[0].id];
    if (confirmBtn) confirmBtn.disabled = false;
    confirmWinner();
    return;
  } else {
    eligible.forEach(player => {
      const btn = document.createElement('button');
      btn.className = 'winner-btn';
      btn.dataset.playerId = player.id;
      btn.innerHTML = `
      <div class="w-avatar">${player.name.charAt(0).toUpperCase()}</div>
      <span class="w-name">${player.name}</span>
      <span class="w-chips">${formatAmount(player.chips)}</span>
      `;
      // タッチとクリック両対応
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectWinner(btn, player.id);
      };
      btn.addEventListener('click', handleSelect);
      btn.addEventListener('touchend', handleSelect);
      selectEl.appendChild(btn);
    });
  }

  document.getElementById('showdown-overlay').classList.add('visible');
}

function selectWinner(btn, playerId) {
  if (onlineState.role === 'player') return;
  if (isSplitMode) {
    btn.classList.toggle('selected');
    if (selectedWinners.includes(playerId)) {
      selectedWinners = selectedWinners.filter(id => id !== playerId);
    } else {
      selectedWinners.push(playerId);
    }
  } else {
    // Single select
    document.querySelectorAll('.winner-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedWinners = [playerId];
  }
  document.getElementById('confirm-winner-btn').disabled = selectedWinners.length === 0;
}

function toggleSplit() {
  if (onlineState.role === 'player') return;
  isSplitMode = !isSplitMode;
  document.getElementById('split-toggle').classList.toggle('on', isSplitMode);
  if (!isSplitMode) {
    // Reset to single select
    if (selectedWinners.length > 1) selectedWinners = [selectedWinners[0]];
    document.querySelectorAll('.winner-btn').forEach(b => {
      const keep = selectedWinners.includes(b.dataset.playerId);
      b.classList.toggle('selected', keep);
    });
    document.getElementById('confirm-winner-btn').disabled = selectedWinners.length === 0;
  }
}

function cancelShowdown() {
  // Reset selections and close overlay
  selectedWinners = [];
  splitMode = false;
  document.querySelectorAll('.winner-btn').forEach(btn => btn.classList.remove('selected'));
  document.getElementById('split-toggle').classList.remove('on');
  document.getElementById('confirm-winner-btn').disabled = true;
  document.getElementById('showdown-overlay').classList.remove('visible');
}

function confirmWinner() {
  if (onlineState.role === 'player') return;
  if (confirmLock || selectedWinners.length === 0) return;
  confirmLock = true;
  setTimeout(() => { confirmLock = false; }, 200);
  const totalPot = getPotTotal(gameState);
  const per = selectedWinners.length ? Math.floor(totalPot / selectedWinners.length) : 0;
  const rem = totalPot - per * selectedWinners.length;

  const winnerIds = selectedWinners.slice();
  const winners = selectedWinners.map(id => {
    const p = gameState.players.find(p => p.id === id);
    return { name: p?.name || '—', icon: p?.icon || '' };
  });
  gameState = distributePot(gameState, selectedWinners);
  recordHandResult(winners, totalPot);
  document.getElementById('showdown-overlay').classList.remove('visible');
  render();
  setWinnerHighlight(winnerIds);
  animatePotToWinners(winnerIds);
  playWinChime();

  let gainText = '';
  if (selectedWinners.length === 1) {
    gainText = `+${totalPot.toLocaleString()} チップ`;
  } else {
    gainText = rem > 0
      ? `各 +${per.toLocaleString()} / 先頭 +${(per + rem).toLocaleString()} チップ`
      : `各 +${per.toLocaleString()} チップ`;
  }
  setTimeout(() => showNextHand(winners, gainText), 220);

  // Broadcast resolution so non-host clients can exit showdown
  if (onlineState.role === 'host' && roomChannel) {
    roomChannel.send({
      type: 'broadcast',
      event: 'showdown-resolved',
      payload: { winnerIds: selectedWinners }
    });
    broadcastState();
  }
}

// ─── NEXT HAND ────────────────────────────────
function showNextHand(winners, gainText = '') {
  const winnersEl = document.getElementById('next-hand-winners');
  winnersEl.innerHTML = winners.map(w => `
    <div class="next-hand-winner-item">
      <div class="next-hand-winner-avatar">${w.icon || w.name.charAt(0).toUpperCase()}</div>
      <div class="next-hand-winner-name">${w.name}</div>
    </div>
  `).join('');
  document.getElementById('next-hand-gain').textContent = gainText;
  document.getElementById('showdown-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');
  document.getElementById('next-hand-overlay').classList.add('visible');
  const btn = document.querySelector('.next-hand-btn');
  if (btn) {
    if (onlineState.role !== 'player') {
      btn.disabled = false;
      btn.textContent = '次のハンド';
    } else {
      btn.disabled = true;
      btn.textContent = 'ホストの操作を待っています';
    }
  }
  // flash
  const flash = document.getElementById('win-flash');
  flash.classList.add('visible');
  setTimeout(() => flash.classList.remove('visible'), 600);
}

function showChipStatus() {
  const tableEl = document.getElementById('chip-status-table');
  if (!gameState || !gameState.players) return;

  tableEl.innerHTML = gameState.players.map(p => {
    const before = chipsBeforeHand[p.id] || p.chips;
    const change = p.chips - before;
    const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
    const changeText = change > 0 ? `+${change.toLocaleString()}` : change < 0 ? change.toLocaleString() : '±0';
    return `
      <div class="chip-status-row">
        <div class="chip-status-avatar">${p.icon || p.name.charAt(0).toUpperCase()}</div>
        <div class="chip-status-name">${p.name}</div>
        <div class="chip-status-chips">${p.chips.toLocaleString()}</div>
        <div class="chip-status-change ${changeClass}">${changeText}</div>
      </div>
    `;
  }).join('');

  document.getElementById('chip-status-overlay').classList.add('visible');
}

function hideChipStatus() {
  document.getElementById('chip-status-overlay').classList.remove('visible');
  document.getElementById('next-hand-overlay').classList.remove('visible');
}

function showHistory() {
  const listEl = document.getElementById('history-list');
  if (handHistory.length === 0) {
    listEl.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
  } else {
    listEl.innerHTML = handHistory.map((h, i) => {
      const winnerText = h.winners.map(w =>
        `<span class="history-winner">${w.icon || ''} ${w.name} +${Math.floor(h.pot / h.winners.length).toLocaleString()}</span>`
      ).join(' ');
      const loserText = h.losers.map(l =>
        `<span class="history-loser">${l.icon || ''} ${l.name} -${l.loss.toLocaleString()}</span>`
      ).join(' ');
      return `
        <div class="history-item">
          <div class="history-header">No.${h.hand} (Pot: ${h.pot.toLocaleString()})</div>
          <div class="history-result">
            ${winnerText}
            ${loserText}
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('history-overlay').classList.add('visible');
  document.getElementById('header-menu').style.display = 'none';
}

function hideHistory() {
  document.getElementById('history-overlay').classList.remove('visible');
}

function showDisconnectDialog() {
  document.getElementById('disconnect-overlay').classList.add('visible');
}

function hideDisconnectDialog() {
  document.getElementById('disconnect-overlay').classList.remove('visible');
}

function saveChipsBeforeHand() {
  if (!gameState || !gameState.players) return;
  chipsBeforeHand = {};
  gameState.players.forEach(p => {
    chipsBeforeHand[p.id] = p.chips;
  });
}

function recordHandResult(winners, totalPot) {
  if (!gameState || !gameState.players) return;
  const losers = gameState.players.filter(p =>
    !winners.some(w => w.name === p.name) && chipsBeforeHand[p.id] !== p.chips
  );
  handHistory.push({
    hand: handHistory.length + 1,
    winners: winners.map(w => ({ name: w.name, icon: w.icon })),
    losers: losers.map(l => ({ name: l.name, icon: l.icon, loss: chipsBeforeHand[l.id] - l.chips })),
    pot: totalPot
  });
}

function nextHand() {
  if (nextHandLock) return;
  if (onlineState.role === 'player') return;
  nextHandLock = true;
  setTimeout(() => { nextHandLock = false; }, 200);
  document.getElementById('next-hand-overlay').classList.remove('visible');
  advanceToNextHandAndBroadcast();
}

function showGameOver() {
  const winner = gameState.players.find(p => p.chips > 0);
  const overlay = document.getElementById('next-hand-overlay');
  const winnersEl = document.getElementById('next-hand-winners');
  if (winner) {
    winnersEl.innerHTML = `
      <div class="next-hand-winner-item">
        <div class="next-hand-winner-avatar">${winner.icon || winner.name.charAt(0).toUpperCase()}</div>
        <div class="next-hand-winner-name">${winner.name}</div>
      </div>
    `;
    document.querySelector('.next-hand-sub').textContent = 'が優勝！';
  } else {
    winnersEl.innerHTML = '<div class="next-hand-winner-name">ゲーム終了</div>';
    document.querySelector('.next-hand-sub').textContent = '';
  }
  document.getElementById('next-hand-gain').textContent = '';
  overlay.classList.add('visible');
  // ボタンを「新しいゲーム」に変更
  const btn = overlay.querySelector('.next-hand-btn');
  if (btn) {
    if (onlineState.role !== 'player') {
      btn.disabled = false;
      btn.textContent = '新しいゲーム';
      btn.onclick = () => {
        overlay.classList.remove('visible');
        setUiState('room');
        if (roomChannel) {
          roomChannel.send({ type: 'broadcast', event: 'ui-phase', payload: { phase: 'room' } });
        }
      };
    } else {
      btn.disabled = true;
      btn.textContent = 'ホストの操作を待っています';
      btn.onclick = null;
    }
  }
}

function advanceToNextHandAndBroadcast() {
  gameState = advanceDealer(gameState);
  gameState = startHand(gameState);
  saveChipsBeforeHand();

  if (gameState.phase === 'finished') {
    showGameOver();
    return;
  }

  render();
  startActionTimer();
  if (onlineState.role === 'host') {
    broadcastState();
  }
}

// ─── SETUP SCREEN LOGIC ───────────────────────
function addPlayer() {
  const inputs = document.getElementById('player-inputs');
  const playerNum = inputs.querySelectorAll('.player-row').length + 1;
  const row = document.createElement('div');
  row.className = 'player-row';
  const zenkakuNum = String(playerNum).replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
  row.innerHTML = `<input type="text" class="player-name-input" placeholder="プレイヤー名" value="プレイヤー${zenkakuNum}"><div class="icon-picker"></div><button class="remove-btn" onclick="removePlayer(this)">×</button>`;
  inputs.appendChild(row);
  refreshIconPickers();
}

function removePlayer(btn) {
  const inputs = document.querySelectorAll('.player-row');
  if (inputs.length <= 2) return; // 最低2人
  btn.closest('.player-row').remove();
  refreshIconPickers();
}

function startGame() {
  if (onlineState.role === 'player') {
    setRoomStatus('ホストが開始します');
    return;
  }
  const settings = collectSettingsFromForm();
  let players = [];
  if (onlineState.role === 'host') {
    players = getOnlinePlayers();
    if (players.length < 2) {
      const hostStatus = document.getElementById('waiting-host-status');
      if (hostStatus) hostStatus.textContent = '参加者が足りません';
      return;
    }
  } else {
    players = getLocalPlayers();
    if (players.length < 2) return;
    localStorage.setItem('pokerPlayerNames', JSON.stringify(getLocalPlayerFormData()));
  }

  startGameWithPlayers(players, settings);

  if (onlineState.role === 'host' && roomChannel) {
    broadcastState();
    roomChannel.send({ type: 'broadcast', event: 'start-game', payload: { settings, state: gameState } });
    roomChannel.send({ type: 'broadcast', event: 'ui-phase', payload: { phase: 'playing' } });
  }
  updatePlayerBadge();
}

// Load saved player names on page load
function loadSavedPlayerNames() {
  const saved = localStorage.getItem('pokerPlayerNames');
  if (!saved) return;

  try {
    const savedData = JSON.parse(saved);
    if (!Array.isArray(savedData) || savedData.length === 0) return;

    const container = document.getElementById('player-inputs');
    container.innerHTML = '';

    savedData.forEach((entry) => {
      const name = typeof entry === 'string' ? entry : (entry?.name || '');
      const icon = typeof entry === 'string' ? '' : (entry?.icon || '');
      const row = document.createElement('div');
      row.className = 'player-row';
      row.dataset.icon = icon;
      row.innerHTML = `<input type="text" class="player-name-input" placeholder="プレイヤー名" value="${name}"><div class="icon-picker"></div><button class="remove-btn" onclick="removePlayer(this)">×</button>`;
      container.appendChild(row);
    });
    refreshIconPickers();
  } catch (e) {
    console.log('Failed to load saved player names:', e);
  }
}

function syncTournamentOptions() {
  const toggle = document.getElementById('tournament-mode-toggle');
  const options = document.getElementById('tournament-options');
  if (!toggle || !options) return;
  options.style.display = toggle.checked ? 'block' : 'none';
}

// ランダム表示名生成（ポーカー風のニックネーム）
function generateRandomName() {
  const animals = ['Fox', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Owl', 'Cat', 'Dog'];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${animal}${num}`;
}

const ICON_OPTIONS = ['🦖', '🐱', '🐶', '🐼', '🐸', '🐵', '🦊', '🐯'];

function buildIconPicker(row, selectedIcon, index) {
  const picker = row.querySelector('.icon-picker');
  if (!picker) return;
  const fallback = ICON_OPTIONS[index % ICON_OPTIONS.length];
  const current = selectedIcon || row.dataset.icon || fallback;
  row.dataset.icon = current;
  picker.innerHTML = '';
  ICON_OPTIONS.forEach(icon => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn' + (icon === current ? ' selected' : '');
    btn.textContent = icon;
    btn.dataset.icon = icon;
    btn.addEventListener('click', () => {
      row.dataset.icon = icon;
      picker.querySelectorAll('.icon-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.icon === icon);
      });
    }, { passive: true });
    picker.appendChild(btn);
  });
}

function refreshIconPickers() {
  const rows = document.querySelectorAll('.player-row');
  rows.forEach((row, i) => buildIconPicker(row, row.dataset.icon, i));
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);
  loadSavedPlayerNames();
  refreshIconPickers();
  setUiState('room');
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;
  setupNumericInput(document.getElementById('sb-input'));
  setupNumericInput(document.getElementById('bb-input'));
  setupNumericInput(document.getElementById('initial-chips-input'));

  const toggle = document.getElementById('tournament-mode-toggle');
  if (toggle) {
    bindOnce(toggle, 'change', syncTournamentOptions);
  }
  syncTournamentOptions();
  const perPlayerToggle = document.getElementById('per-player-stack-toggle');
  if (perPlayerToggle) {
    bindOnce(perPlayerToggle, 'change', renderPerPlayerStackList);
    bindOnce(perPlayerToggle, 'change', updateInitialChipsBB);
  }
  const bbInput = document.getElementById('bb-input');
  if (bbInput) {
    bindOnce(bbInput, 'input', updateInitialChipsBB);
    bindOnce(bbInput, 'input', updatePerPlayerBBDisplays);
    bindOnce(bbInput, 'change', updateInitialChipsBB);
    bindOnce(bbInput, 'change', updatePerPlayerBBDisplays);
  }
  const chipsInput = document.getElementById('initial-chips-input');
  if (chipsInput) {
    bindOnce(chipsInput, 'input', updateInitialChipsBB);
    bindOnce(chipsInput, 'change', updateInitialChipsBB);
    bindOnce(chipsInput, 'blur', updateInitialChipsBB);
  }
  updateInitialChipsBB();

  const hostBtn = document.getElementById('room-host-btn');
  const joinBtn = document.getElementById('room-join-btn');
  const localBtn = document.getElementById('room-local-btn');
  const leaveBtn = document.getElementById('room-leave-btn');
  const waitingStartBtn = document.getElementById('waiting-start-btn');
  const copyBtn = document.getElementById('room-copy-btn');
  const settingsLeaveBtn = document.getElementById('settings-leave-btn');
  const codeInput = document.getElementById('room-code-input');
  const nameInput = document.getElementById('display-name-input');

  // デフォルトでランダム名を設定
  if (nameInput && !nameInput.value) {
    nameInput.value = generateRandomName();
  }
  const startBtn = document.getElementById('start-btn');
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('header-menu');
  const menuResetBtn = document.getElementById('menu-reset-btn');
  if (hostBtn) {
    hostBtn.addEventListener('click', async () => {
      onlineState.displayName = nameInput ? nameInput.value.trim() : '';
      onlineState.ready = false;
      onlineState.seat = '';
      updatePlayerBadge();
      if (!onlineState.displayName) {
        setRoomStatus('名前を入力してください');
        return;
      }
      if (codeInput) codeInput.value = '';
      const ok = await createRoomWithUniqueCode();
      if (ok) {
        onlineState.role = 'host';
        setUiState('waiting');
        updateParticipantList();
      }
    });
  }
  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      onlineState.displayName = nameInput ? nameInput.value.trim() : '';
      onlineState.ready = false;
      onlineState.seat = '';
      updatePlayerBadge();
      if (!onlineState.displayName) {
        setRoomStatus('名前を入力してください');
        return;
      }
      const code = codeInput ? codeInput.value : '';
      const ok = await joinRoom('player', code);
      if (ok) {
        onlineState.role = 'player';
        setUiState('waiting');
        updateParticipantList();
      }
    });
  }
  if (localBtn) {
    localBtn.addEventListener('click', () => {
      onlineState.displayName = nameInput ? nameInput.value.trim() : '';
      onlineState.role = 'local';
      updatePlayerBadge();
      setUiState('settings');
      updateSettingsPanels();
    });
  }
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      leaveRoom();
    });
  }
  if (settingsLeaveBtn) {
    settingsLeaveBtn.addEventListener('click', () => {
      leaveRoom();
    });
  }
  if (waitingStartBtn) {
    waitingStartBtn.addEventListener('click', () => {
      if (onlineState.role !== 'host') return;
      setUiState('settings');
      updateSettingsPanels();
      if (roomChannel) {
        roomChannel.send({ type: 'broadcast', event: 'ui-phase', payload: { phase: 'settings' } });
      }
    });
  }
  const waitingBackBtn = document.getElementById('waiting-back-btn');
  if (waitingBackBtn) {
    waitingBackBtn.addEventListener('click', () => {
      leaveRoom();
    });
  }
  const settingsBackBtn = document.getElementById('settings-back-btn');
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', () => {
      if (onlineState.role === 'local') {
        setUiState('room');
      } else {
        leaveRoom();
      }
    });
  }
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startGame();
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = onlineState.roomCode || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = 'COPIED';
        setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1200);
      } catch (e) {}
    });
  }
  if (codeInput) {
    bindOnce(codeInput, 'blur', () => {
      codeInput.value = normalizeRoomCode(codeInput.value);
    });
    const focusRoomInput = () => setTimeout(() => codeInput.focus(), 0);
    bindOnce(codeInput, 'click', focusRoomInput, { passive: true });
    bindOnce(codeInput, 'touchstart', focusRoomInput, { passive: true });
    const roomRow = codeInput.parentElement;
    if (roomRow) {
      bindOnce(roomRow, 'click', focusRoomInput, { passive: true });
      bindOnce(roomRow, 'touchstart', focusRoomInput, { passive: true });
    }
    bindOnce(codeInput, 'focus', () => debugLog('room-code: focus'), { passive: true });
    bindOnce(codeInput, 'blur', () => debugLog('room-code: blur'), { passive: true });
  }
  if (menuBtn && menu) {
    bindOnce(menuBtn, 'click', () => {
      const open = menu.style.display === 'flex';
      menu.style.display = open ? 'none' : 'flex';
    });
    bindOnce(document, 'click', (e) => {
      if (!menu.contains(e.target) && e.target !== menuBtn) {
        menu.style.display = 'none';
      }
    });
  }
  const displayToggleBtn = document.getElementById('menu-display-toggle');
  if (displayToggleBtn) {
    displayToggleBtn.textContent = `表記切替: ${displayMode === 'bb' ? 'BB' : 'CHIP'}`;
    displayToggleBtn.addEventListener('click', () => {
      applyDisplayMode(displayMode === 'bb' ? 'chips' : 'bb');
      if (menu) menu.style.display = 'none';
    });
  }
  const menuHistoryBtn = document.getElementById('menu-history-btn');
  if (menuHistoryBtn) {
    menuHistoryBtn.addEventListener('click', () => {
      showHistory();
    });
  }
  if (menuResetBtn) {
    menuResetBtn.addEventListener('click', () => {
      if (menu) menu.style.display = 'none';
      resetToSetup();
    });
  }

  const readyBtn = document.getElementById('ready-toggle-btn');
  if (readyBtn) {
    readyBtn.addEventListener('click', () => {
      if (onlineState.role === 'host') return;
      if (!onlineState.seat) {
        const seatHelp = document.getElementById('seat-help-text');
        if (seatHelp) seatHelp.textContent = '先に席を選んでください';
        return;
      }
      onlineState.ready = !onlineState.ready;
      readyBtn.classList.toggle('on', onlineState.ready);
      readyBtn.textContent = onlineState.ready ? 'READY' : 'WAIT';
      updatePresence({ ready: onlineState.ready });
      updateParticipantList();
    });
  }

  // Fold confirm dialog handlers
  const foldCancelBtn = document.getElementById('fold-cancel-btn');
  const foldConfirmBtn = document.getElementById('fold-confirm-btn');
  if (foldCancelBtn) {
    bindOnce(foldCancelBtn, 'click', () => {
      hideFoldConfirm();
    });
  }
  if (foldConfirmBtn) {
    bindOnce(foldConfirmBtn, 'click', () => {
      hideFoldConfirm();
      doAction('fold');
    });
  }

  // All-in confirm dialog handlers
  const allinCancelBtn = document.getElementById('allin-cancel-btn');
  const allinConfirmBtn = document.getElementById('allin-confirm-btn');
  if (allinCancelBtn) {
    bindOnce(allinCancelBtn, 'click', () => {
      hideAllInConfirm();
    });
  }
  if (allinConfirmBtn) {
    bindOnce(allinConfirmBtn, 'click', () => {
      confirmAllIn();
    });
  }

  // Disconnect dialog handlers
  const disconnectWaitBtn = document.getElementById('disconnect-wait-btn');
  const disconnectExitBtn = document.getElementById('disconnect-exit-btn');
  if (disconnectWaitBtn) {
    bindOnce(disconnectWaitBtn, 'click', () => {
      hideDisconnectDialog();
    });
  }
  if (disconnectExitBtn) {
    bindOnce(disconnectExitBtn, 'click', () => {
      hideDisconnectDialog();
      leaveRoom();
    });
  }

  if (debugEnabled) {
    initDebugPanel();
    bindOnce(document, 'click', (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const hit = document.elementFromPoint(x, y);
      debugLog(`click @${x},${y} -> ${hit?.id || hit?.className || hit?.tagName}`);
    }, { passive: true });
    bindOnce(document, 'touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      const hit = document.elementFromPoint(t.clientX, t.clientY);
      debugLog(`touch @${t.clientX},${t.clientY} -> ${hit?.id || hit?.className || hit?.tagName}`);
    }, { passive: true });
  }
});

function resetToSetup() {
  document.getElementById('showdown-overlay').classList.remove('visible');
  document.getElementById('next-hand-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');
  document.getElementById('tournament-bar').style.display = 'none';
  stopTournamentTimer();
  stopActionTimer();
  gameState = null;
  if (onlineState.role !== 'local') {
    leaveRoom();
  } else {
    setUiState('room');
  }
}

// ─── SERVICE WORKER & UPDATE NOTIFICATION ─────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('SW registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            showUpdateNotification();
          }
        });
      });
    }).catch(err => console.log('SW registration failed:', err));
  });
}

function showUpdateNotification() {
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.innerHTML = `
    <span>新しいバージョンが利用可能です</span>
    <button onclick="location.reload()">更新</button>
  `;
  banner.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--gold); color: #0f1a16; padding: 12px 20px;
    border-radius: 8px; font-family: inherit; font-size: 14px;
    display: flex; align-items: center; gap: 12px; z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  banner.querySelector('button').style.cssText = `
    background: #0f1a16; color: var(--gold); border: none;
    padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;
  `;
  document.body.appendChild(banner);
}
