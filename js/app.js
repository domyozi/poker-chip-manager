/**
 * app.js
 * Application state, UI, network, and event handlers
 */

// ═══════════════════════════════════════════════════════════════
// SECTION: Global Variables
// ═══════════════════════════════════════════════════════════════

const APP_VERSION = "v0.9.1";
// Vertical lane layout: no longer using circular seat presets
const ENABLE_SEAT_PRESETS = false;
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
const $ = (id) => document.getElementById(id);
const missingDomOnce = new Set();
function isDebugEnabled() {
  try {
    return window.DEBUG_MODE === true || localStorage.getItem('debug') === '1';
  } catch (e) {
    return window.DEBUG_MODE === true;
  }
}
function warnMissing(id) {
  if (!isDebugEnabled()) return;
  const key = `${id}:${uiState}:${appMode}`;
  if (missingDomOnce.has(key)) return;
  missingDomOnce.add(key);
  console.warn('[missing-dom]', id, { uiState, appMode });
}
function setText(id, value) {
  const el = $(id);
  if (!el) {
    warnMissing(id);
    return false;
  }
  el.textContent = String(value);
  return true;
}
function setHTML(id, html) {
  const el = $(id);
  if (!el) {
    warnMissing(id);
    return false;
  }
  el.innerHTML = html;
  return true;
}
function setTextWithBumpId(id, value) {
  const el = $(id);
  if (!el) {
    warnMissing(id);
    return false;
  }
  setTextWithBump(el, String(value));
  return true;
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
let selectedWinners = [];     // showdown: 現在のポットの勝者選択
let showdownPotIndex = 0;
let showdownPotSelections = [];
let showdownPotSplitModes = [];
let showdownPotEligiblePlayers = [];
let showdownAutoAssignedPotIndices = new Set();
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
let currentGameSettings = null;

// Timer state
let timerSettings = { duration: 0, soundEnabled: true };
let actionTimer = null;
let timerWarningPlayed = false;
let timeRemaining = 0;
let timerStartTime = 0;

// Tournament state (online only)
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
  characterId: "",
  localPlayerId: "",
  seat: "",
  ready: false
};
let onlineReady = false;
let uiState = 'room'; // room | waiting | settings | playing
let appMode = 'offline'; // offline | online
let lastActionPanelLogKey = null;
// Offline mode: display rotation - which player index appears at bottom (front)
let offlineDisplayFrontIdx = 0;
let offlineLastActorId = null;
let debugBannerEl = null;

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

let seatLayoutTimer = null;
let seatLayoutScheduled = false;
let seatPresetWarned = false;
function scheduleSeatLayoutRefresh() {
  if (seatLayoutScheduled) return;
  seatLayoutScheduled = true;
  if (seatLayoutTimer) clearTimeout(seatLayoutTimer);
  seatLayoutTimer = setTimeout(() => {
    seatLayoutTimer = null;
    requestAnimationFrame(() => {
      seatLayoutScheduled = false;
      if (uiState === 'playing') renderPlayers();
    });
  }, 150);
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

function showBootError(err) {
  console.error('[boot-error]', err);
  if (document.getElementById('boot-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'boot-error-banner';
  banner.textContent = '初期化に失敗しました。ページを再読み込みしてください。';
  banner.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(180, 30, 30, 0.9); color: #fff; padding: 10px 14px;
    border-radius: 8px; font-size: 12px; z-index: 9999;
    font-family: inherit; letter-spacing: 0.2px;
  `;
  document.body.appendChild(banner);
  setRoomStatus('初期化に失敗しました。再読み込みしてください');
}

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

function isDebugBannerEnabled() {
  return window.DEBUG_MODE === true || localStorage.getItem('debug') === '1';
}

function ensureDebugBanner() {
  if (!isDebugBannerEnabled()) {
    if (debugBannerEl) {
      debugBannerEl.remove();
      debugBannerEl = null;
    }
    return;
  }
  if (!debugBannerEl) {
    debugBannerEl = document.createElement('div');
    debugBannerEl.className = 'debug-banner';
    document.body.appendChild(debugBannerEl);
  }
  updateDebugBanner();
}

function updateDebugBanner() {
  if (!debugBannerEl) return;
  const channel = roomChannel ? 'on' : 'off';
  debugBannerEl.textContent = `mode: ${appMode} | role: ${onlineState.role} | channel: ${channel}`;
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
    characterId: onlineState.characterId || "",
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
  const requestedState = state;
  const screenMap = {
    room: 'room-screen',
    waiting: 'waiting-screen',
    settings: 'settings-screen',
    playing: 'game-screen'
  };
  let resolvedState = screenMap[state] ? state : 'room';
  let activeScreenId = screenMap[resolvedState];
  let activeScreenEl = activeScreenId ? document.getElementById(activeScreenId) : null;
  if (!activeScreenEl) {
    const fallback = Object.entries(screenMap).find(([, id]) => document.getElementById(id));
    if (fallback) {
      resolvedState = fallback[0];
      activeScreenId = fallback[1];
      activeScreenEl = document.getElementById(activeScreenId);
    }
  }
  uiState = resolvedState;
  const activeEl = document.activeElement;
  if (activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur();
  }
  const screens = Object.values(screenMap);
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === activeScreenId;
    el.classList.toggle('hidden', !isActive);
    el.classList.toggle('is-active', isActive);
    el.style.display = isActive ? 'flex' : 'none';
    el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    if ('inert' in el) {
      el.inert = !isActive;
    } else if (!isActive) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  });
  const activeScreen = activeScreenEl || document.getElementById(activeScreenId);
  if (activeScreen) activeScreen.scrollTop = 0;
  if (isDebugEnabled()) {
    const activeCount = document.querySelectorAll('.screen.is-active').length;
    console.log('[ui-state]', {
      requested: requestedState,
      resolved: uiState,
      activeScreenId: activeScreen ? activeScreen.id : null,
      activeCount
    });
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
  updateDebugBanner();
  updateConnectionIndicatorVisibility();
  updateTournamentUiVisibility();
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
  updateDebugBanner();
}

function setRoomStatus(text) {
  const el = document.getElementById('room-status');
  if (el) el.textContent = text;
}

function updateConnectionIndicator(status) {
  const indicator = document.getElementById('connection-indicator');
  if (!indicator) return;
  if (appMode === 'offline' || onlineState.role === 'local') {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = 'inline-flex';
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

function updateConnectionIndicatorVisibility() {
  updateConnectionIndicator(onlineState.connected ? 'connected' : 'disconnected');
}

function updateTournamentUiVisibility() {
  const config = document.getElementById('tournament-config');
  const toggle = document.getElementById('tournament-mode-toggle');
  const options = document.getElementById('tournament-options');
  const bar = document.getElementById('tournament-bar');
  const isOnlineHost = appMode === 'online' && onlineState.role === 'host';
  if (config) config.style.display = isOnlineHost ? 'block' : 'none';
  if (!isOnlineHost && toggle) toggle.checked = false;
  if (options) options.style.display = (isOnlineHost && toggle && toggle.checked) ? 'block' : 'none';
  if (bar && (appMode !== 'online' || !tournamentSettings.enabled)) {
    bar.style.display = 'none';
  }
}

function syncTournamentOptions() {
  const toggle = document.getElementById('tournament-mode-toggle');
  const options = document.getElementById('tournament-options');
  if (!toggle || !options) return;
  options.style.display = toggle.checked ? 'block' : 'none';
}

function normalizeActorState(state) {
  if (!state || !Array.isArray(state.players)) return state;
  if (!state.isHandActive) return state;
  const actor = state.players[state.currentPlayerIndex];
  if (actor && actor.status === 'active') return state;
  const next = findNextActivePlayer(state, state.currentPlayerIndex);
  if (next !== -1) {
    return { ...state, currentPlayerIndex: next };
  }
  if (countEligiblePlayers(state) <= 1) {
    return endHand(state);
  }
  return state;
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
  const ring = $('seat-ring');
  if (!ring) {
    warnMissing('seat-ring');
    return;
  }
  setHTML('seat-ring', '<div class="seat-center">TABLE</div>');
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
      const isSelf = isPresenceYou(occupant, i - 1);
      const characterId = normalizeCharacterId(occupant.characterId || '', i - 1);
      seat.innerHTML = `
        ${renderAvatarMarkup(characterId, { isYou: isSelf, sizeClass: 'avatar--xs', hideYou: true })}
        <div>${occupant.name || 'Guest'}</div>
        <div class="seat-label">Seat ${i}</div>
      `;
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
    list.forEach((p, index) => {
      const item = document.createElement('div');
      const isSelf = isPresenceYou(p, index);
      const characterId = normalizeCharacterId(p.characterId || '', index);
      item.className = 'participant-item' + (isSelf ? ' self' : '');
      item.innerHTML = `
        <div class="participant-left">
          ${renderAvatarMarkup(characterId, { isYou: isSelf, sizeClass: 'avatar--sm', hideYou: false })}
          <div>
            <div class="participant-name">${p.name || 'Guest'}${isSelf ? ' (あなた)' : ''} ${p.seat ? `• Seat ${p.seat}` : ''}</div>
            <div class="participant-meta">${p.online ? 'ONLINE' : 'OFFLINE'}</div>
          </div>
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
    list.forEach((p, index) => {
      const item = document.createElement('div');
      const isSelf = isPresenceYou(p, index);
      const characterId = normalizeCharacterId(p.characterId || '', index);
      item.className = 'participant-item';
      item.innerHTML = `
        <div class="participant-left">
          ${renderAvatarMarkup(characterId, { isYou: isSelf, sizeClass: 'avatar--sm', hideYou: false })}
          <div class="participant-name">${p.name || 'Guest'} ${p.seat ? `• Seat ${p.seat}` : ''}</div>
        </div>
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
  localPendingActionKey = null;
  actionLock = false;
  lastActionId = null;
  lastTurnKey = null;
  pendingAllInAction = null;
  onlineState = {
    role: "local",
    roomCode: "",
    connected: false,
    displayName: onlineState.displayName,
    characterId: onlineState.characterId,
    localPlayerId: onlineState.localPlayerId,
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
  appMode = 'offline';
  updatePlayerBadge();
}

async function resetOnlineStateForOffline(fallbackName = '') {
  if (roomChannel) {
    await leaveRoom();
  }
  localPendingActionKey = null;
  actionLock = false;
  lastActionId = null;
  lastTurnKey = null;
  pendingAllInAction = null;
  onlineState.role = 'local';
  if (!onlineState.displayName) {
    onlineState.displayName = fallbackName || onlineState.displayName || 'Player';
  }
  appMode = 'offline';
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
    characterId: onlineState.characterId,
    localPlayerId: onlineState.localPlayerId,
    seat: onlineState.seat,
    ready: onlineState.ready,
    joinedAt: onlineState.joinedAt
  };
  if (!onlineState.characterId) {
    onlineState.characterId = normalizeCharacterId('', 0);
  }
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
      if (payload?.payload?.chipsBeforeHand) {
        chipsBeforeHand = { ...payload.payload.chipsBeforeHand };
      }
      syncLocalPlayerIdentityFromState();
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
      const before = payload?.payload?.chipsBeforeHand;
      if (settings) applySettings(settings);
      if (state) gameState = state;
      if (before) chipsBeforeHand = { ...before };
      syncLocalPlayerIdentityFromState();
      setUiState('playing');
      const tournamentBar = document.getElementById('tournament-bar');
      if (tournamentBar) {
        if (appMode === 'online' && tournamentSettings.enabled) {
          tournamentBar.style.display = 'flex';
          startTournamentTimer();
        } else {
          tournamentBar.style.display = 'none';
          stopTournamentTimer();
        }
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
      const perPotWinners = payload?.payload?.perPotWinners || null;
      const winnerIds = payload?.payload?.winnerIds || [];
      const winnerSet = new Set(winnerIds);
      if (Array.isArray(perPotWinners) && winnerSet.size === 0) {
        perPotWinners.forEach(ids => (ids || []).forEach(id => winnerSet.add(id)));
      }
      if (!gameState || (winnerSet.size === 0 && !perPotWinners)) return;
      const totalPot = getPotTotal(gameState);
      const winners = Array.from(winnerSet).map(id => {
        const p = gameState.players.find(pl => pl.id === id);
        return { name: p?.name || '—', characterId: p?.characterId || '' };
      });
      gameState = distributePot(gameState, perPotWinners || winnerIds);
      render();
      setWinnerHighlight(Array.from(winnerSet));
      animatePotToWinners(Array.from(winnerSet));
      playWinChime();
      const gainText = `POT総額 ${totalPot.toLocaleString()} チップ`;
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
  roomChannel.send({
    type: 'broadcast',
    event: 'state-sync',
    payload: { state: gameState, chipsBeforeHand: { ...chipsBeforeHand } }
  });
}

function sendActionRequest(type, amount) {
  if (!roomChannel) return;
  roomChannel.send({ type: 'broadcast', event: 'action-request', payload: { type, amount } });
}

function applyRemoteAction(type, amount) {
  const prevState = gameState;
  const result = processAction(gameState, type, amount);
  if (result.error) { console.warn(result.error); actionLock = false; return; }
  gameState = normalizeActorState(result);
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
  if (!gameState || !gameState.isHandActive) return;
  const actor = gameState.players[gameState.currentPlayerIndex];
  if (!actor || actor.status !== 'active') return;

  timeRemaining = timerSettings.duration;
  timerStartTime = Date.now();
  timerWarningPlayed = false;
  updateTimerDisplay();

  actionTimer = setInterval(() => {
    const elapsed = (Date.now() - timerStartTime) / 1000;
    timeRemaining = Math.max(0, timerSettings.duration - elapsed);

    updateTimerDisplay();

    // 残り5秒で警告音（1回だけ）
    if (timerSettings.soundEnabled && Math.ceil(timeRemaining) === 5 && !timerWarningPlayed) {
      timerWarningPlayed = true;
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

function startTournamentTimer() {
  stopTournamentTimer();
  if (!tournamentSettings.enabled) return;
  if (appMode !== 'online') return;

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
  if (!bar || !tournamentSettings.enabled || appMode !== 'online') return;
  const mins = Math.floor(tournamentTimeRemaining / 60);
  const secs = tournamentTimeRemaining % 60;
  bar.querySelector('.next-level span').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;
  bar.querySelector('.level').textContent = `Level ${currentBlindLevel}`;
  bar.querySelector('.blinds').textContent =
    `${gameState.smallBlind} / ${gameState.bigBlind}`;
}

function collectSettingsFromForm() {
  const tournamentToggle = document.getElementById('tournament-mode-toggle');
  const levelSelect = document.getElementById('blind-level-select');
  return {
    smallBlind: parseInt(document.getElementById('sb-input').value) || 10,
    bigBlind: parseInt(document.getElementById('bb-input').value) || 20,
    initialChips: parseInt(document.getElementById('initial-chips-input').value) || 1000,
    timerDuration: parseInt(document.getElementById('timer-select').value) || 0,
    soundEnabled: document.getElementById('timer-sound-toggle').checked,
    tournamentEnabled: tournamentToggle ? tournamentToggle.checked : false,
    levelDuration: levelSelect ? parseInt(levelSelect.value) || 15 : 15
  };
}

function applySettings(settings) {
  timerSettings.duration = settings.timerDuration;
  timerSettings.soundEnabled = settings.soundEnabled;
  tournamentSettings.enabled = !!settings.tournamentEnabled && appMode === 'online';
  tournamentSettings.levelDuration = settings.levelDuration || 15;
  currentBlindLevel = 1;
}

function getLocalPlayers() {
  const rows = document.querySelectorAll('.player-row');
  const players = [];
  rows.forEach((row, i) => {
    const input = row.querySelector('.player-name-input');
    const name = input ? input.value.trim() : '';
    const characterId = normalizeCharacterId(row.dataset.characterId || '', i);
    if (!name && !characterId) return;
    const finalName = name || `プレイヤー${i + 1}`;
    players.push({ name: finalName, characterId, seatIndex: i });
  });
  return players;
}

function getLocalPlayerFormData() {
  const rows = document.querySelectorAll('.player-row');
  const data = [];
  rows.forEach((row, i) => {
    const input = row.querySelector('.player-name-input');
    const name = input ? input.value.trim() : '';
    const characterId = normalizeCharacterId(row.dataset.characterId || '', i);
    if (!name && !characterId) return;
    data.push({ name, characterId });
  });
  return data;
}

function getOnlinePlayerNames() {
  const list = getPresenceList();
  return list.map((p, i) => p.name || `Player ${i + 1}`);
}

function getOnlinePlayers() {
  const list = getPresenceList();
  return list.map((p, i) => ({
    name: p.name || `Player ${i + 1}`,
    characterId: normalizeCharacterId(p.characterId || '', i),
    seatIndex: p.seat ? parseInt(p.seat, 10) : i
  }));
}

function getPerPlayerStackEnabled() {
  const toggle = document.getElementById('per-player-stack-toggle');
  return !!toggle && toggle.checked;
}

function getPerPlayerStackInputs() {
  return Array.from(document.querySelectorAll('.stack-row input[data-index]'));
}

function renderPerPlayerStackList() {
  const listEl = $('per-player-stack-list');
  if (!listEl) {
    warnMissing('per-player-stack-list');
    return;
  }
  const enabled = getPerPlayerStackEnabled();
  listEl.style.display = enabled ? 'flex' : 'none';
  const initialChipsRow = $('initial-chips-row');
  if (initialChipsRow) {
    initialChipsRow.style.display = enabled ? 'none' : 'flex';
  }
  if (!enabled) return;

  const settings = collectSettingsFromForm();
  const players = onlineState.role === 'host' ? getOnlinePlayers() : getLocalPlayers();
  setHTML('per-player-stack-list', '');
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
  // Reset local action state to avoid stale locks from previous sessions.
  localPendingActionKey = null;
  actionLock = false;
  lastActionId = null;
  lastTurnKey = null;
  pendingAllInAction = null;
  currentGameSettings = { ...settings };
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
    characterId: normalizeCharacterId(p.characterId || '', i),
    startingChips: perPlayerEnabled ? (stacksByIndex.get(i) || settings.initialChips) : settings.initialChips
  }));
  if (onlineState.role !== 'host') {
    onlineState.role = 'local';
    if (!onlineState.displayName) {
      onlineState.displayName = playersWithStacks[0]?.name || onlineState.displayName;
    }
  }
  gameState = initGame(playersWithStacks, settings.smallBlind, settings.bigBlind, settings.initialChips);
  syncLocalPlayerIdentityFromState();
  gameState.timerSettings = { ...timerSettings };
  gameState.tournamentSettings = { ...tournamentSettings };
  handHistory = [];
  saveChipsBeforeHand();
  gameState = startHand(gameState);
  // Initialize offline display rotation to first acting player
  if (onlineState.role === 'local') {
    offlineDisplayFrontIdx = gameState.currentPlayerIndex;
    offlineLastActorId = null;
  }

  setUiState('playing');
  console.log('[startGameWithPlayers]', {
    uiState,
    hasGameState: !!gameState,
    isHandActive: !!gameState?.isHandActive,
    role: onlineState.role,
    displayName: onlineState.displayName,
    roomChannel: !!roomChannel
  });


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
      list.forEach((p, index) => {
        const item = document.createElement('div');
        const isSelf = isPresenceYou(p, index);
        const characterId = normalizeCharacterId(p.characterId || '', index);
        item.className = 'participant-item' + (isSelf ? ' self' : '');
        item.innerHTML = `
          <div class="participant-left">
            ${renderAvatarMarkup(characterId, { isYou: isSelf, sizeClass: 'avatar--sm', hideYou: false })}
            <div class="participant-name">${p.name || 'Guest'}${isSelf ? ' (あなた)' : ''}</div>
          </div>
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
  updateRemoveButtons();
  updateAddPlayerVisibility();
  updateTournamentUiVisibility();
}

// calcPositions is no longer used in vertical lane layout
// Kept for backward compatibility with other functions that might reference it
function calcPositions(n) {
  return Array.from({ length: n }, () => ({ x: 0.5, y: 0.5 }));
}

function buildPositionLabels(count, dealerIndex) {
  const labels = Array.from({ length: count }, () => '');
  if (count <= 0) return labels;
  const normDealer = ((dealerIndex % count) + count) % count;
  labels[normDealer] = 'BTN';
  if (count === 1) return labels;
  const sbIdx = count === 2 ? normDealer : (normDealer + 1) % count;
  labels[sbIdx] = labels[sbIdx] ? `${labels[sbIdx]}/SB` : 'SB';
  const bbIdx = (sbIdx + 1) % count;
  labels[bbIdx] = labels[bbIdx] ? `${labels[bbIdx]}/BB` : 'BB';
  if (count >= 4) {
    const utgIdx = (bbIdx + 1) % count;
    if (!labels[utgIdx]) labels[utgIdx] = 'UTG';
  }
  return labels;
}

function getCanonicalSeatOrder(state) {
  if (!state || !Array.isArray(state.players)) return [];
  return state.players
    .map((p, i) => {
      const rawSeat = typeof p?.seatIndex !== 'undefined' ? p.seatIndex : i;
      const seat = Number.isFinite(rawSeat) ? rawSeat : i;
      return { index: i, seat };
    })
    .sort((a, b) => (a.seat - b.seat) || (a.index - b.index))
    .map(item => item.index);
}

function buildOfflineDisplayOrder(state, frontIdx, lastActorId) {
  const order = getCanonicalSeatOrder(state);
  if (order.length === 0) return [];
  const frontPos = order.indexOf(frontIdx);
  const start = frontPos === -1 ? 0 : frontPos;
  const rotated = order.slice(start).concat(order.slice(0, start));
  const opponents = rotated.slice(1);
  if (lastActorId && opponents.length > 1) {
    const lastActorIdx = state.players.findIndex(p => p.id === lastActorId);
    const pos = opponents.indexOf(lastActorIdx);
    if (pos !== -1 && pos !== opponents.length - 1) {
      opponents.splice(pos, 1);
      opponents.push(lastActorIdx);
    }
  }
  return [rotated[0], ...opponents];
}

function debugOfflineRotation({ prevState, nextState, displayOrder, lastActorId }) {
  if (!isDebugEnabled()) return;
  if (!prevState || !nextState) return;
  const seatOrder = getCanonicalSeatOrder(nextState);
  const playersSummary = nextState.players.map((p, i) => ({
    idx: i,
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex
  }));
  const prevActor = prevState.players[prevState.currentPlayerIndex];
  const nextActor = nextState.players[nextState.currentPlayerIndex];
  const slots = {
    front: displayOrder[0],
    backLeft: displayOrder[1] ?? null,
    backRight: displayOrder.length > 1 ? displayOrder[displayOrder.length - 1] : null
  };
  console.log('[offline-rotation]', {
    players: playersSummary,
    seatOrder,
    currentActorId: prevActor?.id,
    nextActorId: nextActor?.id,
    lastActorId,
    displayOrder,
    slots
  });
}

function truncateName(name, maxChars) {
  const normalized = (name || '').trim();
  if (!normalized) return normalized;
  const chars = Array.from(normalized);
  return chars.length > maxChars ? chars.slice(0, maxChars).join('') : normalized;
}

function getSlotAnchors(playerCount) {
  const front = { key: 'bottom', x: 50, y: 82 };
  const opponentAnchors = {
    1: [{ key: 'top-center', x: 50, y: 12 }],
    2: [
      { key: 'top-left', x: 24, y: 18 },
      { key: 'top-right', x: 76, y: 18 }
    ],
    3: [
      { key: 'top-left', x: 22, y: 20 },
      { key: 'top-center', x: 50, y: 10 },
      { key: 'top-right', x: 78, y: 20 }
    ],
    4: [
      { key: 'mid-left', x: 14, y: 46 },
      { key: 'top-left', x: 24, y: 20 },
      { key: 'top-right', x: 76, y: 20 },
      { key: 'mid-right', x: 86, y: 46 }
    ],
    5: [
      { key: 'mid-left', x: 14, y: 46 },
      { key: 'top-left', x: 24, y: 20 },
      { key: 'top-center', x: 50, y: 10 },
      { key: 'top-right', x: 76, y: 20 },
      { key: 'mid-right', x: 86, y: 46 }
    ],
    6: [
      { key: 'low-left', x: 14, y: 54 },
      { key: 'mid-left', x: 14, y: 34 },
      { key: 'top-left', x: 24, y: 20 },
      { key: 'top-right', x: 76, y: 20 },
      { key: 'mid-right', x: 86, y: 34 },
      { key: 'low-right', x: 86, y: 54 }
    ],
    7: [
      { key: 'low-left', x: 14, y: 54 },
      { key: 'mid-left', x: 14, y: 34 },
      { key: 'top-left', x: 24, y: 20 },
      { key: 'top-center', x: 50, y: 10 },
      { key: 'top-right', x: 76, y: 20 },
      { key: 'mid-right', x: 86, y: 34 },
      { key: 'low-right', x: 86, y: 54 }
    ]
  };
  const opponentCount = Math.max(0, playerCount - 1);
  const anchors = opponentAnchors[opponentCount];
  if (!anchors) return null;
  return [front, ...anchors];
}

function createPlayerSlot(player, idx, posLabel, isActivePlayer, isOfflineMode, anchor) {
  const slot = document.createElement('div');
  slot.className = 'player-slot';
  slot.dataset.anchor = anchor.key;
  slot.style.setProperty('--slot-x', `${anchor.x}%`);
  slot.style.setProperty('--slot-y', `${anchor.y}%`);

  // leftプレイヤーは非表示
  if (player.status === 'left') {
    slot.style.display = 'none';
    return slot;
  }

  slot.appendChild(createPlayerPanel(player, idx, posLabel, isActivePlayer, isOfflineMode));

  return slot;
}

function getBetMarkerPosition(anchorKey) {
  switch (anchorKey) {
    case 'top-center': return { x: 50, y: 18 };
    case 'top-left': return { x: 34, y: 25 };
    case 'top-right': return { x: 66, y: 25 };
    case 'mid-left': return { x: 30, y: 34 };
    case 'mid-right': return { x: 70, y: 34 };
    case 'low-left': return { x: 27, y: 55 };
    case 'low-right': return { x: 73, y: 55 };
    case 'bottom': return { x: 50, y: 70 };
    default: return { x: 50, y: 50 };
  }
}

function renderBetMarker(container, player, anchorKey) {
  if (!player || player.currentBet <= 0) return;
  const pos = getBetMarkerPosition(anchorKey);
  const betEl = document.createElement('div');
  betEl.className = 'table-bet-marker';
  betEl.style.left = `${pos.x}%`;
  betEl.style.top = `${pos.y}%`;
  betEl.innerHTML = `
    <img class="bet-chip-icon" src="img/betchip.png" alt="chip">
    <span>${formatAmount(player.currentBet)}</span>
  `;
  container.appendChild(betEl);
}

function renderPlayers() {
  const slotsEl = $('player-slots');
  const betsContainer = $('table-bets');

  if (!slotsEl) {
    warnMissing('player-slots');
    return;
  }

  // Clear all areas
  slotsEl.innerHTML = '';
  if (betsContainer) betsContainer.innerHTML = '';

  if (!gameState || !gameState.players.length) return;

  // leftプレイヤーを除外して有効プレイヤーを計算
  const visiblePlayers = gameState.players.filter(p => p.status !== 'left');
  const visibleCount = visiblePlayers.length;
  if (visibleCount === 0) return;

  const positionLabels = buildPositionLabels(gameState.players.length, gameState.dealerIndex);
  const isOfflineMode = onlineState.role === 'local';
  const playerCount = gameState.players.length;

  // Determine which player appears at front (bottom)
  let frontPlayerIdx;
  if (isOfflineMode) {
    // Offline: use display rotation (current acting player at front)
    frontPlayerIdx = offlineDisplayFrontIdx;
    // Validate index
    if (frontPlayerIdx < 0 || frontPlayerIdx >= playerCount) {
      frontPlayerIdx = gameState.currentPlayerIndex;
    }
  } else {
    // Online: find "you" player
    frontPlayerIdx = -1;
    gameState.players.forEach((player, idx) => {
      if (isPlayerYou(player, idx)) {
        frontPlayerIdx = idx;
      }
    });
    // Fallback
    if (frontPlayerIdx === -1) {
      frontPlayerIdx = playerCount - 1;
    }
  }

  // Build front player and opponents in CLOCKWISE order from front player's perspective
  // Offline uses canonical seat order + last-actor alignment
  let displayOrder = [];
  if (isOfflineMode) {
    displayOrder = buildOfflineDisplayOrder(gameState, frontPlayerIdx, offlineLastActorId);
  } else {
    displayOrder = [frontPlayerIdx];
    for (let i = 1; i < playerCount; i++) {
      const idx = (frontPlayerIdx + i) % playerCount;
      displayOrder.push(idx);
    }
  }
  const frontPlayer = { player: gameState.players[displayOrder[0]], idx: displayOrder[0] };
  const opponents = displayOrder.slice(1).map(idx => ({ player: gameState.players[idx], idx }));
  const anchors = getSlotAnchors(playerCount);
  if (!anchors || anchors.length !== playerCount) {
    if (isDebugEnabled()) console.warn('[layout] missing anchors for count', playerCount);
    return;
  }

  // Render front player (slot 0)
  if (frontPlayer) {
    const { player, idx } = frontPlayer;
    const slot = createPlayerSlot(player, idx, positionLabels[idx], true, isOfflineMode, anchors[0]);
    slotsEl.appendChild(slot);
    if (betsContainer) renderBetMarker(betsContainer, player, anchors[0].key);
  }

  // Render opponents in slot order (left -> right)
  opponents.forEach((item, i) => {
    const anchor = anchors[i + 1];
    if (!anchor) return;
    const { player, idx } = item;
    const slot = createPlayerSlot(player, idx, positionLabels[idx], false, isOfflineMode, anchor);
    slotsEl.appendChild(slot);
    if (betsContainer) renderBetMarker(betsContainer, player, anchor.key);
  });

  document.body.classList.toggle('debug-layout', !!window.__DEBUG_LAYOUT__);
}

// Create a player panel - Active (front) or Back (opponent)
function createPlayerPanel(player, idx, posLabel, isActivePlayer, isOfflineMode = false) {
  const isDealer = idx === gameState.dealerIndex;
  const isFolded = player.status === "folded";
  const isAllIn = player.status === "allIn";
  const isSitout = player.status === "sitout";
  const isWinner = winnerHighlightIds.includes(player.id);

  // Use different class based on active/back status
  const baseClass = isActivePlayer ? 'player-active' : 'player-back';
  let classes = baseClass;
  if (isFolded) classes += ' folded';
  if (isAllIn) classes += ' allin';
  if (isSitout) classes += ' sitout';
  if (isWinner) classes += ' is-winner';

  const characterId = normalizeCharacterId(player.characterId || '', idx);
  const avatarMarkup = renderAvatarMarkup(characterId, {
    isYou: false, // No "YOU" indicator in new design
    isDealer,
    isTurn: false, // No turn animation on avatar
    isWinner,
    fallbackIndex: idx
  });
  const showName = !!player.name;
  const fullName = showName ? player.name : `P${idx + 1}`;
  const displayName = fullName;

  // Timer ring for active player only
  const isActorTurn = idx === gameState.currentPlayerIndex && gameState.isHandActive;
  const showTimer = isActivePlayer && isActorTurn && timerSettings.duration > 0;
  const avatarSize = isActivePlayer ? 56 : 40;
  const timerRadius = isActivePlayer ? 24 : 17;
  const timerRingHtml = showTimer ? `
    <svg class="timer-ring" width="${avatarSize}" height="${avatarSize}" viewBox="0 0 ${avatarSize} ${avatarSize}">
      <circle class="bg" cx="${avatarSize/2}" cy="${avatarSize/2}" r="${timerRadius}"/>
      <circle class="progress" cx="${avatarSize/2}" cy="${avatarSize/2}" r="${timerRadius}"
        style="stroke-dasharray: ${2 * Math.PI * timerRadius}; stroke-dashoffset: 0"/>
    </svg>
    <div class="timer-text">0:${timerSettings.duration.toString().padStart(2, '0')}</div>
  ` : '';

  // Position badge (BTN/SB/BB)
  const positionBadgeHtml = posLabel ? `<span class="position-badge">${posLabel}</span>` : '';

  // Dealer badge
  const dealerBadgeHtml = isDealer ? '<div class="dealer-badge">D</div>' : '';

  const panel = document.createElement('div');
  panel.className = `player-panel ${classes}`;
  panel.dataset.playerId = player.id;

  panel.innerHTML = `
    <div class="allin-badge">ALL IN</div>
    <div class="avatar avatar-img">
      ${timerRingHtml}
      ${avatarMarkup}
      ${dealerBadgeHtml}
    </div>
    <div class="info-pill player-meta">
      <div class="player-info">
        <span class="name player-name">${displayName}</span>
      </div>
      <div class="chips player-stack">${formatAmount(player.chips)}</div>
    </div>
    <div class="badge-row">${positionBadgeHtml}</div>
    <div class="name-tooltip" aria-hidden="true"></div>
  `;

  if (isOfflineMode) {
    attachNameTooltip(panel, fullName);
  }

  return panel;
}

function attachNameTooltip(cardEl, name) {
  if (!cardEl || !name) return;
  const tooltip = cardEl.querySelector('.name-tooltip');
  if (!tooltip) return;
  tooltip.textContent = name;
  let hideTimer = null;
  let pressTimer = null;
  const show = () => {
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }, 1600);
  };
  bindOnce(cardEl, 'click', () => show());
  bindOnce(cardEl, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    pressTimer = setTimeout(show, 450);
  }, { passive: true });
  bindOnce(cardEl, 'pointerup', () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
  }, { passive: true });
  bindOnce(cardEl, 'pointercancel', () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
  }, { passive: true });
}

// Get bet position class based on opponent count and index
function getBetPositionClass(opponentCount, opIdx, isLocal) {
  if (isLocal) return 'bet-bottom';

  if (opponentCount === 1) {
    return 'bet-top';
  } else if (opponentCount === 2) {
    return opIdx === 0 ? 'bet-top-left' : 'bet-top-right';
  } else {
    // 3+ opponents
    return `bet-top-${opIdx + 1}`;
  }
}

// Render a bet chip on the table
function renderTableBet(container, player, posLabel, positionClass) {
  const betEl = document.createElement('div');
  betEl.className = `table-bet ${positionClass}`;

  // Show SB/BB on chip
  const chipLabel = posLabel && (posLabel.includes('SB') || posLabel.includes('BB'))
    ? posLabel.replace('BTN/', '').replace('/SB', '').replace('/BB', '')
    : '';

  betEl.innerHTML = `
    <div class="bet-chip">${chipLabel || ''}</div>
    <div class="bet-amount">${formatAmount(player.currentBet)}</div>
  `;
  container.appendChild(betEl);
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
  const total = (gameState?.pots || []).reduce((s, p) => s + p.amount, 0);
  const el = $('pot-amount');
  const blindsEl = $('pot-blinds');
  if (!el) {
    warnMissing('pot-amount');
    return;
  }
  const prev = parseInt(el.dataset.value || '0', 10) || 0;
  el.dataset.value = String(total);
  setText('pot-amount', formatAmount(total));
  if (blindsEl && gameState) {
    blindsEl.textContent = `Blinds: ${formatAmount(gameState.smallBlind)},${formatAmount(gameState.bigBlind)}`;
  }
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

  const potEl = $('status-pot');
  const toCallEl = $('status-to-call');
  const minRaiseEl = $('status-min-raise');

  if (potEl) setTextWithBumpId('status-pot', formatAmount(potTotal));
  else warnMissing('status-pot');
  if (toCallEl) {
    const toCallText = toCall === 0 ? 'FREE' : formatAmount(toCall);
    setTextWithBumpId('status-to-call', toCallText);
    toCallEl.classList.toggle('highlight', toCall === 0);
  } else {
    warnMissing('status-to-call');
  }
  if (minRaiseEl) setTextWithBumpId('status-min-raise', formatAmount(minRaiseTo));
  else warnMissing('status-min-raise');
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
  const container = $('community-cards');
  if (!container) {
    warnMissing('community-cards');
    return;
  }
  setHTML('community-cards', '');
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
  setText('phase-label', phase.toUpperCase());

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
  const panel = $('action-panel');
  const btnsEl = $('action-btns');
  const lockMessage = $('action-lock-message');
  const actorLabel = $('actor-label');
  if (!panel) warnMissing('action-panel');
  if (!btnsEl) warnMissing('action-btns');
  if (!actorLabel) warnMissing('actor-label');
  if (!panel || !btnsEl) return;
  setHTML('action-btns', '');
  const debugMode = isDebugEnabled();
  let debugReason = '';
  const logSnapshot = (reason) => {
    if (!debugMode) return;
    const actorIdx = gameState ? gameState.currentPlayerIndex : null;
    const actor = gameState && gameState.players ? gameState.players[actorIdx] : null;
    const turnKeyLocal = actor && gameState ? `${actor.id}:${gameState.currentMaxBet}:${gameState.phase}` : '';
    console.log('[renderActionPanel]', {
      debugReason: reason,
      uiState,
      hasGameState: !!gameState,
      isHandActive: !!gameState?.isHandActive,
      phase: gameState?.phase,
      currentPlayerIndex: gameState?.currentPlayerIndex,
      actorName: actor?.name,
      actorStatus: actor?.status,
      actorCurrentBet: actor?.currentBet,
      actorChips: actor?.chips,
      role: onlineState.role,
      displayName: onlineState.displayName,
      roomChannel: !!roomChannel,
      isLocalSession: appMode === 'offline',
      isMyTurn: appMode === 'offline' || (actor && actor.name === onlineState.displayName),
      hasPending: localPendingActionKey === turnKeyLocal,
      localPendingActionKey,
      turnKey: turnKeyLocal
    });
  };
  logSnapshot('enter');

  if (!gameState || !gameState.isHandActive) {
    panel.classList.add('hidden');
    debugReason = !gameState ? 'no_gameState' : 'hand_inactive';
    logSnapshot(debugReason);
    if (debugMode) setText('action-lock-message', debugReason);
    return;
  }

  let actorIdx = gameState.currentPlayerIndex;
  let actor = gameState.players[actorIdx];
  if (!actor) {
    const fallbackIdx = gameState.players.findIndex(p => p.status === 'active');
    if (fallbackIdx >= 0) {
      actorIdx = fallbackIdx;
      gameState.currentPlayerIndex = fallbackIdx;
      actor = gameState.players[actorIdx];
    }
  }
  if (!actor) {
    panel.classList.add('hidden');
    setHTML('actor-label', '<strong>—</strong>のターン');
    debugReason = 'no_actor';
    logSnapshot(debugReason);
    if (debugMode) setText('action-lock-message', debugReason);
    return;
  }
  const turnKey = `${actor.id}:${gameState.currentMaxBet}:${gameState.phase}`;
  if (turnKey !== lastTurnKey) {
    lastTurnKey = turnKey;
    lastActionId = null;
  }
  const isLocalSession = appMode === 'offline';
  const isMyTurn = isLocalSession || actor.name === onlineState.displayName;
  const hasPending = localPendingActionKey === turnKey;
  const logKey = [
    turnKey,
    onlineState.role,
    onlineState.displayName,
    String(!!roomChannel),
    String(isLocalSession),
    String(isMyTurn),
    String(hasPending),
    actor.name
  ].join('|');
  if (logKey !== lastActionPanelLogKey) {
    lastActionPanelLogKey = logKey;
    console.log('[renderActionPanel]', {
      role: onlineState.role,
      roomChannel: !!roomChannel,
      isLocalSession,
      isMyTurn,
      hasPending,
      actorName: actor.name,
      displayName: onlineState.displayName
    });
  }
  updateDebugBanner();

  // アクティブなプレイヤーがいない場合（全員オールインまたはフォールド）
  if (actor.status !== 'active') {
    panel.classList.remove('hidden');
    panel.classList.add('locked');
    setHTML('actor-label', '次のフェーズを待っています...');
    if (lockMessage) lockMessage.style.display = 'none';
    debugReason = 'actor_not_active';
    logSnapshot(debugReason);
    if (debugMode) setText('actor-label', debugReason);
    return;
  }

  panel.classList.remove('hidden');
  panel.classList.remove('locked');
  if (lockMessage) lockMessage.style.display = 'none';

  // Actor label
  setHTML('actor-label', `<strong>${actor.name}</strong> のターンです`);

  if (!isMyTurn || hasPending) {
    panel.classList.add('locked');
    if (lockMessage) {
      lockMessage.style.display = 'block';
      setHTML('action-lock-message', 'あなたの番になるまでお待ちください');
    }
    debugReason = !isMyTurn ? 'not_my_turn' : 'has_pending';
    logSnapshot(debugReason);
    if (debugMode) setText('action-lock-message', debugReason);
    return;
  }

  const callAmt = gameState.currentMaxBet - actor.currentBet;
  const canCheck = callAmt === 0;

  // Fold
  btnsEl.appendChild(makeActionBtn('btn-fold', 'FOLD', '', () => handleFoldAttempt()));

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
  const allInTo = actor.currentBet + actor.chips;
  if (maxRaise >= minRaise) {
    setRaiseValue(minRaise);
    btnsEl.appendChild(makeActionBtn('btn-raise', 'RAISE', '—', () => toggleRaiseArea()));
    setupRaiseSlider(minRaise, maxRaise);
  } else if (allInTo > gameState.currentMaxBet && actor.chips > 0) {
    btnsEl.appendChild(makeActionBtn('btn-raise', 'ALL IN', formatAmount(allInTo), () => {
      pendingAllInAction = { type: 'raise', amount: allInTo };
      showAllInConfirm(actor.chips);
    }));
  }

  // Hide raise area initially
  const raiseArea = $('raise-area');
  if (raiseArea) {
    raiseArea.classList.remove('visible');
  } else {
    warnMissing('raise-area');
  }
}

let actionProcessing = false;
function makeActionBtn(cls, label, sub, onClick) {
  const btn = document.createElement('button');
  btn.className = 'action-btn ' + cls + (sub ? '' : ' no-sub');
  btn.innerHTML = sub
    ? `<span class="btn-label">${label}</span><span class="btn-sub">${sub}</span>`
    : `<span class="btn-label">${label}</span>`;

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
function getRaiseStep() {
  if (!gameState || !gameState.bigBlind) return 1;
  const step = gameState.bigBlind * 0.5;
  return step >= 1 ? step : 1;
}

function snapRaiseValue(value) {
  const step = getRaiseStep();
  return Math.round(value / step) * step;
}

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
  const snapped = snapRaiseValue(value);
  const clamped = Math.max(raiseMin, Math.min(raiseMax, snapped));
  raiseValue = clamped;
  const display = document.getElementById('raise-amount-display');
  if (display) setTextWithBump(display, formatAmount(raiseValue));
  const slider = document.getElementById('raise-slider');
  if (slider && raiseMax > raiseMin) {
    const pct = (raiseValue - raiseMin) / (raiseMax - raiseMin);
    slider.value = Math.round(pct * 100);
  }
  const raiseBtn = document.querySelector('.btn-raise .btn-sub');
  if (raiseBtn) setTextWithBump(raiseBtn, `${formatAmount(raiseValue)}`);
  updateActivePreset();
  updateRaiseMinLabel();
  updateRaiseError();
}

function onRaiseSlide() {
  const slider = document.getElementById('raise-slider');
  const pct = parseInt(slider.value) / 100;
  setRaiseValue(raiseMin + (raiseMax - raiseMin) * pct);
}

function updateRaisePresets() {
  const presetsEl = document.getElementById('raise-presets');
  if (!presetsEl || !gameState) return;
  presetsEl.innerHTML = '';
  const actor = gameState.players[gameState.currentPlayerIndex];
  const callAmt = gameState.currentMaxBet - actor.currentBet;
  const totalPot = getPotTotal(gameState);

  const addPreset = (label, targetValue, extraClass = '') => {
    const value = Math.max(raiseMin, Math.min(raiseMax, snapRaiseValue(targetValue)));
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
  el.style.display = 'none';
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
    const prevState = gameState;
    const prevActorId = gameState?.players?.[gameState.currentPlayerIndex]?.id || null;
    const result = processAction(gameState, type, amount);
    if (result.error) return;
    gameState = result;
    if (onlineState.role === 'local' && gameState.isHandActive) {
      offlineDisplayFrontIdx = gameState.currentPlayerIndex;
      offlineLastActorId = prevActorId;
      const displayOrder = buildOfflineDisplayOrder(gameState, offlineDisplayFrontIdx, offlineLastActorId);
      debugOfflineRotation({
        prevState,
        nextState: gameState,
        displayOrder,
        lastActorId: offlineLastActorId
      });
    }
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
  const currentPhase = gameState.phase;
  if (currentPhase === 'showdown' && lastPhase !== 'showdown') {
    lastPhase = currentPhase; // ループ防止のため先に更新
    stopActionTimer();
    showShowdown();
    return;
  }
  if (currentPhase !== 'showdown' && lastPhase === 'showdown') {
    document.getElementById('showdown-overlay').classList.remove('visible');
  }
  lastPhase = currentPhase;
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
  const prevActorId = gameState.players[gameState.currentPlayerIndex]?.id || null;
  const actorId = gameState.players[gameState.currentPlayerIndex]?.id;
  const actionKey = `${actorId}:${gameState.currentPlayerIndex}:${gameState.currentMaxBet}:${gameState.phase}`;
  if (lastActionId === actionKey) return;
  actionLock = true;
  try {
    const result = processAction(gameState, type, amount);
    if (result.error) { console.warn(result.error); return; }
    gameState = normalizeActorState(result);
    if (hasNewAllIn(prevState, gameState)) playAllInHit();
    lastActionId = actionKey;

    // Hide raise area after action
    document.getElementById('raise-area').classList.remove('visible');

    // Offline mode: rotate display so next acting player is at bottom
    if (onlineState.role === 'local' && gameState.isHandActive) {
      offlineDisplayFrontIdx = gameState.currentPlayerIndex;
      offlineLastActorId = prevActorId;
      const displayOrder = buildOfflineDisplayOrder(gameState, offlineDisplayFrontIdx, offlineLastActorId);
      debugOfflineRotation({
        prevState,
        nextState: gameState,
        displayOrder,
        lastActorId: offlineLastActorId
      });
    }

    render();

    if (gameState.isHandActive) {
      // Restart timer for next player
      startActionTimer();
    }
    if (onlineState.role === 'host') {
      broadcastState();
    }
  } finally {
    actionLock = false;
  }
}

function render() {
  const safeCall = (name, fn) => {
    try {
      fn();
    } catch (err) {
      if (isDebugEnabled()) {
        console.error(`[render-guard] ${name} failed`, err);
      }
    }
  };
  safeCall('renderPlayers', renderPlayers);
  safeCall('renderPot', renderPot);
  safeCall('renderStatusBar', renderStatusBar);
  safeCall('renderCommunityCards', renderCommunityCards);
  safeCall('renderPhase', renderPhase);
  safeCall('renderActionPanel', renderActionPanel);
  safeCall('handlePhaseTransition', handlePhaseTransition);
}

function runSmokeChecks() {
  const requiredByState = {
    playing: [
      'opponents-area',
      'local-player-area',
      'pot-amount',
      'phase-label',
      'action-panel',
      'action-btns',
      'actor-label'
    ],
    room: [
      'room-host-btn',
      'room-join-btn',
      'room-local-btn'
    ]
  };
  const required = requiredByState[uiState] || [];
  const missing = required.filter((id) => !$(id));
  const warnings = [];
  if (uiState === 'room') {
    const btnIds = ['room-host-btn', 'room-join-btn', 'room-local-btn'];
    btnIds.forEach((id) => {
      const el = $(id);
      if (!el) return;
      const style = window.getComputedStyle(el);
      if (style.pointerEvents === 'none') {
        warnings.push(`${id} pointer-events none`);
        console.warn('[smoke-checks] home button pointer-events none', { id });
      }
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && !el.contains(hit)) {
        warnings.push(`${id} hit-test blocked`);
        console.warn('[smoke-checks] home button hit-test blocked', { id, hit });
      }
    });
    const screens = document.querySelectorAll('.screen');
    screens.forEach((screen) => {
      if (screen.id === 'room-screen') return;
      const style = window.getComputedStyle(screen);
      const inertOff = !screen.inert && !screen.hasAttribute('inert');
      if (style.display !== 'none' || style.pointerEvents !== 'none' || inertOff) {
        warnings.push(`inactive screen interactive: ${screen.id}`);
        console.warn('[smoke-checks] inactive screen interactive', {
          id: screen.id,
          display: style.display,
          pointerEvents: style.pointerEvents,
          inert: screen.inert
        });
      }
    });
  }
  if (uiState === 'playing') {
    const opponentsArea = $('opponents-area');
    const localPlayerArea = $('local-player-area');
    const table = document.querySelector('.table-area');
    const opponentCards = opponentsArea ? opponentsArea.querySelectorAll('.player-card') : [];
    const localCards = localPlayerArea ? localPlayerArea.querySelectorAll('.player-card') : [];
    const cards = [...opponentCards, ...localCards];
    if (!opponentsArea) warnings.push('opponents-area missing');
    if (!localPlayerArea) warnings.push('local-player-area missing');
    if (!table) warnings.push('table-area missing');
    cards.forEach((card, i) => {
      // Cards are now flexbox positioned, no left/top needed
      if (table) {
        const t = table.getBoundingClientRect();
        const r = card.getBoundingClientRect();
        const out = r.left < t.left || r.right > t.right || r.top < t.top || r.bottom > t.bottom;
        if (out) {
          warnings.push(`seat ${i} out of bounds`);
          console.warn('[smoke-checks] seat out of bounds', { index: i, card: r, table: t });
        }
      }
    });
  }
  const report = {
    ok: missing.length === 0,
    uiState,
    appMode,
    protocol: location.protocol,
    missing,
    warnings
  };
  if (isDebugEnabled()) {
    console.log('[smoke-checks]', report);
  }
  return report;
}
window.runSmokeChecks = runSmokeChecks;

// ─── SHOWDOWN ─────────────────────────────────
function getPotLabel(index) {
  return index === 0 ? 'メイン' : `サイド${index}`;
}

function buildShowdownPotData() {
  const fallbackEligible = gameState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
  const pots = (gameState?.pots && gameState.pots.length > 0)
    ? gameState.pots
    : [{ amount: getPotTotal(gameState), eligiblePlayerIds: fallbackEligible.map(p => p.id) }];
  showdownPotEligiblePlayers = pots.map(pot => {
    const players = (pot.eligiblePlayerIds || [])
      .map(id => gameState.players.find(p => p.id === id))
      .filter(Boolean);
    return players.sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
  });
  showdownPotSelections = pots.map(() => []);
  showdownPotSplitModes = pots.map(() => false);
  return pots;
}

function renderShowdownPotTabs(pots) {
  const tabsEl = document.getElementById('showdown-pot-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  const visiblePotIndices = pots.map((_, i) => i).filter(i => !showdownAutoAssignedPotIndices.has(i));
  if (visiblePotIndices.length <= 1) {
    tabsEl.style.display = 'none';
    return;
  }
  tabsEl.style.display = 'flex';
  visiblePotIndices.forEach((i) => {
    const btn = document.createElement('button');
    btn.className = `showdown-pot-tab${i === showdownPotIndex ? ' active' : ''}`;
    btn.dataset.potIndex = String(i);
    btn.textContent = getPotLabel(i);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setShowdownPotIndex(i, pots);
    });
    tabsEl.appendChild(btn);
  });
}

function updateShowdownPotTarget(pots) {
  const targetEl = document.getElementById('showdown-pot-target');
  if (!targetEl) return;
  const pot = pots[showdownPotIndex];
  const label = getPotLabel(showdownPotIndex);
  const amountText = pot ? formatAmount(pot.amount) : '—';
  targetEl.textContent = `対象: ${label}ポット (${amountText})`;
}

function updateShowdownTabActive() {
  document.querySelectorAll('.showdown-pot-tab').forEach((btn) => {
    const potIndex = parseInt(btn.dataset.potIndex || '-1', 10);
    btn.classList.toggle('active', potIndex === showdownPotIndex);
  });
}

function updateShowdownConfirmState() {
  const confirmBtn = document.getElementById('confirm-winner-btn');
  if (!confirmBtn) return;
  const ok = showdownPotSelections.every((sel, idx) => {
    const eligible = showdownPotEligiblePlayers[idx] || [];
    if (eligible.length === 0) return true;
    return Array.isArray(sel) && sel.length > 0;
  });
  confirmBtn.disabled = !ok;
}

function updateSplitToggleDisplay(players) {
  const splitToggle = document.getElementById('split-toggle');
  const splitWrap = splitToggle ? splitToggle.closest('.split-toggle') : null;
  if (splitWrap) splitWrap.style.display = players.length >= 2 ? 'flex' : 'none';
  if (splitToggle) {
    splitToggle.classList.toggle('on', showdownPotSplitModes[showdownPotIndex] === true);
  }
}

function renderShowdownWinnerList(pots) {
  const selectEl = document.getElementById('winner-select');
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const players = showdownPotEligiblePlayers[showdownPotIndex] || [];
  selectedWinners = showdownPotSelections[showdownPotIndex]
    ? showdownPotSelections[showdownPotIndex].slice()
    : [];

  updateSplitToggleDisplay(players);
  players.forEach(player => {
    const before = chipsBeforeHand[player.id];
    const stackBefore = Number.isFinite(before) ? before : player.chips + (player.totalBet || 0);
    const btn = document.createElement('button');
    btn.className = 'winner-btn';
    btn.dataset.playerId = player.id;
    btn.innerHTML = `
      ${renderAvatarMarkup(player.characterId || '', {
        isYou: isPlayerYou(player, gameState.players.indexOf(player)),
        sizeClass: 'avatar--sm',
        hideYou: true
      })}
      <span class="w-name">${player.name}</span>
      <span class="w-stack">スタック ${formatAmount(stackBefore)}</span>
      <span class="w-chips">残り ${formatAmount(player.chips)}</span>
    `;
    if (selectedWinners.includes(player.id)) btn.classList.add('selected');
    const handleSelect = (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectWinner(btn, player.id, pots);
    };
    btn.addEventListener('click', handleSelect);
    btn.addEventListener('touchend', handleSelect);
    selectEl.appendChild(btn);
  });
}

function setShowdownPotIndex(index, pots) {
  showdownPotIndex = index;
  updateShowdownTabActive();
  renderShowdownWinnerList(pots);
  updateShowdownPotTarget(pots);
  updateShowdownConfirmState();
}

function autoAssignSidePotsFromMain(pots) {
  if (showdownPotIndex !== 0) return;
  const mainEligible = showdownPotEligiblePlayers[0] || [];
  const topPlayerId = mainEligible[0]?.id;
  if (!topPlayerId || selectedWinners.length !== 1) return;
  if (selectedWinners[0] !== topPlayerId) return;
  for (let i = 1; i < pots.length; i += 1) {
    const eligibleIds = pots[i]?.eligiblePlayerIds || [];
    if (eligibleIds.includes(topPlayerId)) {
      showdownPotSelections[i] = [topPlayerId];
      showdownPotSplitModes[i] = false;
    }
  }
}

function autoAssignSingleEligiblePots(pots) {
  const autoAssigned = new Set();
  pots.forEach((pot, idx) => {
    const eligible = showdownPotEligiblePlayers[idx] || [];
    if (eligible.length === 1 && (!showdownPotSelections[idx] || showdownPotSelections[idx].length === 0)) {
      showdownPotSelections[idx] = [eligible[0].id];
      showdownPotSplitModes[idx] = false;
      autoAssigned.add(idx);
    }
  });
  return autoAssigned;
}

function showShowdown() {
  const total = (gameState.pots||[]).reduce((s,p) => s + p.amount, 0);
  document.getElementById('showdown-pot-amount').textContent = formatAmount(total);
  document.getElementById('next-hand-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');

  const eligible = gameState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
  if (eligible.length === 1 && onlineState.role !== 'player') {
    const winner = eligible[0];
    const perPotWinners = (gameState.pots && gameState.pots.length > 0)
      ? gameState.pots.map(p => (p.eligiblePlayerIds || []).includes(winner.id) ? [winner.id] : [])
      : [[winner.id]];
    const winners = [{ name: winner.name, characterId: winner.characterId || '' }];
    gameState = distributePot(gameState, perPotWinners);
    recordHandResult(winners, total);
    document.getElementById('showdown-overlay').classList.remove('visible');
    render();
    setWinnerHighlight([winner.id]);
    animatePotToWinners([winner.id]);
    playWinChime();
    const gainText = `POT総額 ${total.toLocaleString()} チップ`;
    setTimeout(() => showNextHand(winners, gainText), 220);
    if (onlineState.role === 'host' && roomChannel) {
      roomChannel.send({
        type: 'broadcast',
        event: 'showdown-resolved',
        payload: { perPotWinners, winnerIds: [winner.id] }
      });
      broadcastState();
    }
    return;
  }

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

  const pots = buildShowdownPotData();
  showdownAutoAssignedPotIndices = autoAssignSingleEligiblePots(pots);
  const visiblePotIndices = pots.map((_, i) => i).filter(i => !showdownAutoAssignedPotIndices.has(i));
  if (visiblePotIndices.length === 0) {
    updateShowdownConfirmState();
    confirmWinner();
    return;
  }
  showdownPotIndex = visiblePotIndices[0];
  selectedWinners = showdownPotSelections[showdownPotIndex]?.slice() || [];
  const confirmBtn = document.getElementById('confirm-winner-btn');
  if (confirmBtn) confirmBtn.disabled = true;

  // 1人しかいない場合は自動選択
  const mainEligible = showdownPotEligiblePlayers[0] || [];
  if (mainEligible.length === 1) {
    showdownPotSelections[0] = [mainEligible[0].id];
    selectedWinners = showdownPotSelections[0].slice();
    updateShowdownConfirmState();
    confirmWinner();
    return;
  }

  renderShowdownPotTabs(pots);
  setShowdownPotIndex(showdownPotIndex, pots);
  document.getElementById('showdown-overlay').classList.add('visible');
}

function selectWinner(btn, playerId, pots) {
  if (onlineState.role === 'player') return;
  const splitMode = showdownPotSplitModes[showdownPotIndex] === true;
  if (splitMode) {
    btn.classList.toggle('selected');
    if (selectedWinners.includes(playerId)) {
      selectedWinners = selectedWinners.filter(id => id !== playerId);
    } else {
      selectedWinners.push(playerId);
    }
  } else {
    document.querySelectorAll('.winner-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedWinners = [playerId];
  }
  showdownPotSelections[showdownPotIndex] = selectedWinners.slice();
  autoAssignSidePotsFromMain(pots);
  updateShowdownConfirmState();
}

function toggleSplit() {
  if (onlineState.role === 'player') return;
  const next = !(showdownPotSplitModes[showdownPotIndex] === true);
  showdownPotSplitModes[showdownPotIndex] = next;
  document.getElementById('split-toggle').classList.toggle('on', next);
  if (!next) {
    if (selectedWinners.length > 1) selectedWinners = [selectedWinners[0]];
    document.querySelectorAll('.winner-btn').forEach(b => {
      const keep = selectedWinners.includes(b.dataset.playerId);
      b.classList.toggle('selected', keep);
    });
    showdownPotSelections[showdownPotIndex] = selectedWinners.slice();
  }
  updateShowdownConfirmState();
}

function cancelShowdown() {
  selectedWinners = [];
  showdownPotSelections = [];
  showdownPotSplitModes = [];
  showdownPotEligiblePlayers = [];
  document.querySelectorAll('.winner-btn').forEach(btn => btn.classList.remove('selected'));
  document.getElementById('split-toggle').classList.remove('on');
  document.getElementById('confirm-winner-btn').disabled = true;
  document.getElementById('showdown-overlay').classList.remove('visible');
}

function confirmWinner() {
  if (onlineState.role === 'player') return;
  if (confirmLock) return;
  const ready = showdownPotSelections.every((sel, idx) => {
    const eligible = showdownPotEligiblePlayers[idx] || [];
    if (eligible.length === 0) return true;
    return Array.isArray(sel) && sel.length > 0;
  });
  if (!ready) return;
  confirmLock = true;
  setTimeout(() => { confirmLock = false; }, 200);
  const totalPot = getPotTotal(gameState);

  const perPotWinners = showdownPotSelections.map(sel => sel.slice());
  const winnerIdSet = new Set();
  perPotWinners.forEach(ids => (ids || []).forEach(id => winnerIdSet.add(id)));
  const winnerIds = Array.from(winnerIdSet);
  const winners = winnerIds.map(id => {
    const p = gameState.players.find(p => p.id === id);
    return { name: p?.name || '—', characterId: p?.characterId || '' };
  });

  gameState = distributePot(gameState, perPotWinners);
  recordHandResult(winners, totalPot);
  document.getElementById('showdown-overlay').classList.remove('visible');
  render();
  setWinnerHighlight(winnerIds);
  animatePotToWinners(winnerIds);
  playWinChime();

  const gainText = `POT総額 ${totalPot.toLocaleString()} チップ`;
  setTimeout(() => showNextHand(winners, gainText), 220);

  if (onlineState.role === 'host' && roomChannel) {
    roomChannel.send({
      type: 'broadcast',
      event: 'showdown-resolved',
      payload: { perPotWinners, winnerIds }
    });
    broadcastState();
  }
}

// ─── NEXT HAND ────────────────────────────────
// チップゼロプレイヤーの選択状態を追跡
let zeroChipDecisions = {};

function showNextHand(winners, gainText = '') {
  const winnersEl = document.getElementById('next-hand-winners');
  const names = winners.map(w => w.name).join(' / ');
  winnersEl.innerHTML = `
    <div class="next-hand-winner-name">${names} の勝ち！</div>
  `;
  const subEl = document.querySelector('.next-hand-sub');
  if (subEl) subEl.textContent = '';
  document.getElementById('next-hand-gain').textContent = gainText;

  // 退席プレイヤー（left）を含めてソート
  const activePlayers = gameState?.players?.filter(p => p.status !== 'left') || [];
  const leftPlayers = gameState?.players?.filter(p => p.status === 'left') || [];

  const chipStatusEl = document.getElementById('next-hand-chip-status');
  if (chipStatusEl && gameState?.players) {
    const sortedActive = [...activePlayers].sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
    const allSorted = [...sortedActive, ...leftPlayers];

    chipStatusEl.innerHTML = allSorted.map((p, index) => {
      const before = chipsBeforeHand[p.id] ?? p.chips;
      const change = p.chips - before;
      const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
      const changeText = change > 0 ? `+${change.toLocaleString()}` : change < 0 ? change.toLocaleString() : '+0';
      const rank = index + 1;
      const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : 'rank-normal';
      const isEliminated = p.status === 'left';
      const rowClass = isEliminated ? 'next-hand-chip-row eliminated' : 'next-hand-chip-row';
      const eliminatedLabel = isEliminated ? '<span class="eliminated-label">退席</span>' : '';
      return `
        <div class="${rowClass}">
          <div class="next-hand-chip-rank ${rankClass}">${rank}</div>
          ${renderAvatarMarkup(p.characterId || '', { sizeClass: 'avatar--xs', hideYou: true })}
          <div class="next-hand-chip-line">
            <span class="next-hand-chip-name">${p.name}${eliminatedLabel}</span>
            <span class="next-hand-chip-stack">${p.chips.toLocaleString()}</span>
            <span class="next-hand-chip-delta ${changeClass}">(${changeText})</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // チップゼロプレイヤーの検出と選択UI
  const zeroChipPlayers = activePlayers.filter(p => p.chips === 0 && p.status !== 'left');
  const zeroChipSection = document.getElementById('zero-chip-section');
  const zeroChipList = document.getElementById('zero-chip-list');
  const nextHandBtn = document.getElementById('next-hand-btn');

  if (zeroChipPlayers.length > 0 && onlineState.role !== 'player') {
    zeroChipDecisions = {};
    zeroChipList.innerHTML = zeroChipPlayers.map(p => `
      <div class="zero-chip-player" data-player-id="${p.id}">
        <div class="zero-chip-player-info">
          ${renderAvatarMarkup(p.characterId || '', { sizeClass: 'avatar--xs', hideYou: true })}
          <span class="zero-chip-player-name">${p.name}</span>
        </div>
        <div class="zero-chip-actions">
          <button class="zero-chip-btn rebuy" onclick="handleZeroChipDecision('${p.id}', 'rebuy')">チップ追加</button>
          <button class="zero-chip-btn sitout" onclick="handleZeroChipDecision('${p.id}', 'sitout')">離席中</button>
          <button class="zero-chip-btn leave" onclick="handleZeroChipDecision('${p.id}', 'leave')">退席</button>
        </div>
      </div>
    `).join('');
    zeroChipSection.style.display = 'block';
    nextHandBtn.style.display = 'none';
  } else {
    zeroChipSection.style.display = 'none';
    nextHandBtn.style.display = 'block';
  }

  document.getElementById('showdown-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');
  document.getElementById('next-hand-overlay').classList.add('visible');

  // ホスト/ローカルのみハンド間調整ボタンを表示
  const betweenHandActions = document.getElementById('between-hand-actions');
  if (betweenHandActions) {
    betweenHandActions.style.display = onlineState.role !== 'player' ? 'flex' : 'none';
  }

  if (nextHandBtn) {
    if (onlineState.role !== 'player') {
      nextHandBtn.disabled = false;
      nextHandBtn.textContent = '次のハンド';
    } else {
      nextHandBtn.disabled = true;
      nextHandBtn.textContent = 'ホストの操作を待っています';
    }
  }

  // flash
  const flash = document.getElementById('win-flash');
  flash.classList.add('visible');
  setTimeout(() => flash.classList.remove('visible'), 600);
}

function handleZeroChipDecision(playerId, decision) {
  if (!gameState) return;
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  const playerEl = document.querySelector(`.zero-chip-player[data-player-id="${playerId}"]`);

  if (decision === 'rebuy') {
    // リバイダイアログを表示
    showRebuyDialog(playerId);
    return;
  }

  if (decision === 'sitout') {
    player.status = 'sitout';
    zeroChipDecisions[playerId] = 'sitout';
  } else if (decision === 'leave') {
    player.status = 'left';
    zeroChipDecisions[playerId] = 'left';
    recordPlayerChange('leave', player);
  }

  // ボタンの見た目を更新
  if (playerEl) {
    const btns = playerEl.querySelectorAll('.zero-chip-btn');
    btns.forEach(btn => btn.style.opacity = '0.4');
    const activeBtn = playerEl.querySelector(`.zero-chip-btn.${decision === 'sitout' ? 'sitout' : 'leave'}`);
    if (activeBtn) {
      activeBtn.style.opacity = '1';
      activeBtn.style.outline = '2px solid var(--gold)';
    }
  }

  checkAllZeroChipDecisions();
}

function showRebuyDialog(playerId) {
  const player = gameState?.players?.find(p => p.id === playerId);
  if (!player) return;

  const defaultChips = currentGameSettings?.initialChips || 1000;
  const input = prompt(`${player.name} のチップ追加額を入力:`, defaultChips);
  if (input === null) return;

  const chips = parseInt(input, 10);
  if (!Number.isFinite(chips) || chips <= 0) {
    alert('有効なチップ数を入力してください');
    return;
  }

  player.chips = chips;
  player.status = 'active';
  zeroChipDecisions[playerId] = 'rebuy';

  // ボタンの見た目を更新
  const playerEl = document.querySelector(`.zero-chip-player[data-player-id="${playerId}"]`);
  if (playerEl) {
    const btns = playerEl.querySelectorAll('.zero-chip-btn');
    btns.forEach(btn => btn.style.opacity = '0.4');
    const activeBtn = playerEl.querySelector('.zero-chip-btn.rebuy');
    if (activeBtn) {
      activeBtn.style.opacity = '1';
      activeBtn.style.outline = '2px solid var(--gold)';
      activeBtn.textContent = `+${chips.toLocaleString()}`;
    }
  }

  checkAllZeroChipDecisions();
}

function checkAllZeroChipDecisions() {
  const activePlayers = gameState?.players?.filter(p => p.status !== 'left') || [];
  const zeroChipPlayers = activePlayers.filter(p => p.chips === 0 && p.status !== 'left' && p.status !== 'sitout');

  // 全てのチップゼロプレイヤーに決定がされたか確認
  const allDecided = zeroChipPlayers.length === 0 ||
    zeroChipPlayers.every(p => zeroChipDecisions[p.id]);

  // rebuy以外で残っているプレイヤー + sitoutプレイヤーが確定
  const pendingCount = gameState?.players?.filter(p =>
    p.chips === 0 && p.status !== 'left' && p.status !== 'sitout' && !zeroChipDecisions[p.id]
  ).length || 0;

  if (pendingCount === 0) {
    const nextHandBtn = document.getElementById('next-hand-btn');
    if (nextHandBtn) {
      nextHandBtn.style.display = 'block';
    }
  }
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
        ${renderAvatarMarkup(p.characterId || '', { sizeClass: 'avatar--sm', hideYou: true })}
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
  const formatHistoryTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
  };
  const listEl = document.getElementById('history-list');
  if (handHistory.length === 0) {
    listEl.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
  } else {
    const historyList = handHistory.slice().reverse();
    listEl.innerHTML = historyList.map((h, i) => {
      const type = h.type || 'hand';
      if (type === 'adjust') {
        const rows = (h.changes || []).map(c => {
          return `<div class="history-loser"><span>${c.name}: ${c.from.toLocaleString()} → ${c.to.toLocaleString()}</span></div>`;
        }).join('');
        return `
          <div class="history-item">
            <div class="history-header">チップ調整 ${formatHistoryTime(h.at)}</div>
            <div class="history-result">${rows}</div>
          </div>
        `;
      }
      if (type === 'player') {
        const actionLabels = {
          add: 'プレイヤー追加',
          remove: 'プレイヤー退席',
          leave: 'プレイヤー退席',
          rebuy: 'リバイ',
          seat: '着席'
        };
        const label = actionLabels[h.action] || 'プレイヤー変更';
        const chipText = typeof h.chips === 'number' && h.chips > 0 ? ` (${h.chips.toLocaleString()})` : '';
        const rowClass = h.action === 'leave' ? 'history-loser' : 'history-winner';
        return `
          <div class="history-item">
            <div class="history-header">${label} ${formatHistoryTime(h.at)}</div>
            <div class="history-result">
              <div class="${rowClass}"><span>${h.name}${chipText}</span></div>
            </div>
          </div>
        `;
      }
      const rows = (h.results || []).filter(r => (typeof r.delta === 'number' ? r.delta : 0) !== 0).map(r => {
        const icon = renderAvatarMarkup(r.characterId || '', { sizeClass: 'avatar--xs', hideYou: true });
        const delta = typeof r.delta === 'number' ? r.delta : 0;
        const deltaText = delta > 0 ? `+${delta.toLocaleString()}` : delta < 0 ? delta.toLocaleString() : '+0';
        const cls = delta > 0 ? 'history-winner' : delta < 0 ? 'history-loser' : 'history-neutral';
        return `<div class="${cls}">${icon}<span>${r.name} ${r.chips.toLocaleString()} (${deltaText})</span></div>`;
      }).join(' ');
      return `
          <div class="history-item">
            <div class="history-header">No.${h.hand} (Pot: ${h.pot.toLocaleString()}) ${formatHistoryTime(h.at)}</div>
            <div class="history-result">
              ${rows}
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

function showChipAdjust() {
  if (!gameState || !gameState.players) return;
  if (onlineState.role === 'player') return;
  if (gameState.isHandActive) {
    alert('ハンド中はチップ調整できません');
    return;
  }
  const listEl = document.getElementById('chip-adjust-list');
  if (!listEl) return;
  const players = [...gameState.players].sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
  listEl.innerHTML = players.map(p => `
    <div class="chip-adjust-row" data-player-id="${p.id}">
      <div class="chip-adjust-name">${p.name}</div>
      <input class="chip-adjust-input" type="number" value="${p.chips}">
    </div>
  `).join('');
  document.getElementById('chip-adjust-overlay').classList.add('visible');
  document.getElementById('header-menu').style.display = 'none';
}

function hideChipAdjust() {
  document.getElementById('chip-adjust-overlay').classList.remove('visible');
}

// next-hand-overlayから呼び出す版（isHandActiveチェックをスキップ）
function showChipAdjustFromNextHand() {
  if (!gameState || !gameState.players) return;
  if (onlineState.role === 'player') return;
  const listEl = document.getElementById('chip-adjust-list');
  if (!listEl) return;
  const activePlayers = gameState.players.filter(p => p.status !== 'left');
  const players = [...activePlayers].sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
  listEl.innerHTML = players.map(p => `
    <div class="chip-adjust-row" data-player-id="${p.id}">
      <div class="chip-adjust-name">${p.name}</div>
      <input class="chip-adjust-input" type="number" value="${p.chips}">
    </div>
  `).join('');
  document.getElementById('chip-adjust-overlay').classList.add('visible');
}

function showPlayerManageFromNextHand() {
  if (!gameState || !gameState.players) return;
  if (onlineState.role === 'player') return;
  rebuildPlayerManageList();
  const chipsInput = document.getElementById('player-manage-chips');
  if (chipsInput) {
    const fallback = currentGameSettings?.initialChips || 1000;
    chipsInput.value = String(fallback);
  }
  const addForm = document.querySelector('.player-manage-form');
  const activeCount = gameState.players.filter(p => p.status !== 'left').length;
  if (addForm) {
    addForm.style.display = activeCount < 8 ? 'flex' : 'none';
  }
  document.getElementById('player-manage-overlay').classList.add('visible');
}

function saveChipAdjust() {
  if (!gameState || !gameState.players) return;
  const listEl = document.getElementById('chip-adjust-list');
  if (!listEl) return;
  const changes = [];
  listEl.querySelectorAll('.chip-adjust-row').forEach(row => {
    const playerId = row.dataset.playerId;
    const input = row.querySelector('.chip-adjust-input');
    const next = parseInt(input?.value || '0', 10);
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    const nextChips = Number.isFinite(next) && next >= 0 ? next : player.chips;
    if (nextChips !== player.chips) {
      changes.push({ id: player.id, name: player.name, from: player.chips, to: nextChips });
      player.chips = nextChips;
    }
  });
  if (changes.length > 0) {
    recordChipAdjustment(changes);
    saveChipsBeforeHand();
    render();
    refreshNextHandChipStatus();
    if (onlineState.role === 'host') broadcastState();
  }
  hideChipAdjust();
}

// next-hand-overlayのチップ状況表示を更新
function refreshNextHandChipStatus() {
  if (!gameState?.players) return;
  const overlay = document.getElementById('next-hand-overlay');
  if (!overlay || !overlay.classList.contains('visible')) return;

  const activePlayers = gameState.players.filter(p => p.status !== 'left');
  const leftPlayers = gameState.players.filter(p => p.status === 'left');
  const chipStatusEl = document.getElementById('next-hand-chip-status');
  if (!chipStatusEl) return;

  const sortedActive = [...activePlayers].sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
  const allSorted = [...sortedActive, ...leftPlayers];

  chipStatusEl.innerHTML = allSorted.map((p, index) => {
    const before = chipsBeforeHand[p.id] ?? p.chips;
    const change = p.chips - before;
    const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
    const changeText = change > 0 ? `+${change.toLocaleString()}` : change < 0 ? change.toLocaleString() : '+0';
    const rank = index + 1;
    const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : 'rank-normal';
    const isEliminated = p.status === 'left';
    const rowClass = isEliminated ? 'next-hand-chip-row eliminated' : 'next-hand-chip-row';
    const eliminatedLabel = isEliminated ? '<span class="eliminated-label">退席</span>' : '';
    return `
      <div class="${rowClass}">
        <div class="next-hand-chip-rank ${rankClass}">${rank}</div>
        ${renderAvatarMarkup(p.characterId || '', { sizeClass: 'avatar--xs', hideYou: true })}
        <div class="next-hand-chip-line">
          <span class="next-hand-chip-name">${p.name}${eliminatedLabel}</span>
          <span class="next-hand-chip-stack">${p.chips.toLocaleString()}</span>
          <span class="next-hand-chip-delta ${changeClass}">(${changeText})</span>
        </div>
      </div>
    `;
  }).join('');
}

function showPlayerManage() {
  if (!gameState || !gameState.players) return;
  if (onlineState.role === 'player') return;
  if (gameState.isHandActive) {
    alert('ハンド中はプレイヤー追加/退席できません');
    return;
  }
  const listEl = document.getElementById('player-manage-list');
  if (!listEl) return;
  rebuildPlayerManageList();
  const chipsInput = document.getElementById('player-manage-chips');
  if (chipsInput) {
    const fallback = currentGameSettings?.initialChips || 1000;
    chipsInput.value = String(fallback);
  }
  // プレイヤー追加フォームの表示制御（7名以下で表示）
  const addForm = document.querySelector('.player-manage-form');
  const activeCount = gameState.players.filter(p => p.status !== 'left').length;
  if (addForm) {
    addForm.style.display = activeCount < 8 ? 'flex' : 'none';
  }
  document.getElementById('player-manage-overlay').classList.add('visible');
  document.getElementById('header-menu').style.display = 'none';
}

function hidePlayerManage() {
  document.getElementById('player-manage-overlay').classList.remove('visible');
}

function rebuildPlayerManageList() {
  const listEl = document.getElementById('player-manage-list');
  if (!listEl || !gameState) return;

  const rankById = new Map(
    [...gameState.players]
      .sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'))
      .map((p, idx) => [p.id, idx + 1])
  );

  // アクティブなプレイヤー
  const activePlayers = gameState.players
    .filter(p => p.status !== 'left')
    .sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));
  // 退席したプレイヤー
  const leftPlayers = gameState.players
    .filter(p => p.status === 'left')
    .sort((a, b) => (b.chips - a.chips) || a.name.localeCompare(b.name, 'ja'));

  let html = activePlayers.map(p => {
    const statusLabel = p.status === 'sitout' ? '<span style="color:#f59e0b;font-size:10px;margin-left:4px;">(離席中)</span>' : '';
    const actionBtn = p.chips === 0
      ? `<button class="player-manage-remove" style="background:#22c55e;" onclick="rebuyPlayer('${p.id}')">リバイ</button>`
      : p.status === 'sitout'
        ? `<button class="player-manage-remove" style="background:#22c55e;" onclick="returnFromSitout('${p.id}')">着席</button>`
        : `<button class="player-manage-remove" onclick="removePlayerFromMenu('${p.id}')">退席</button>`;
    const rank = rankById.get(p.id) || '-';
    return `
      <div class="player-manage-row" data-player-id="${p.id}">
        <div class="player-manage-rank">${rank}</div>
        <div class="player-manage-name">${p.name}${statusLabel}</div>
        <div class="player-manage-name">${formatAmount(p.chips)}</div>
        ${actionBtn}
      </div>
    `;
  }).join('');

  // 退席プレイヤーセクション
  if (leftPlayers.length > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">';
    html += '<div style="font-size:11px;color:#f87171;margin-bottom:8px;">退席プレイヤー</div>';
    html += leftPlayers.map(p => {
      const rank = rankById.get(p.id) || '-';
      const hasChips = p.chips > 0;
      const actionBtn = hasChips
        ? `<button class="player-manage-remove" style="background:#22c55e;" onclick="returnFromLeft('${p.id}')">着席</button>`
        : `<button class="player-manage-remove" style="background:#22c55e;" onclick="rebuyPlayer('${p.id}')">リバイ</button>`;
      return `
        <div class="player-manage-row" data-player-id="${p.id}" style="opacity:0.7;">
          <div class="player-manage-rank">${rank}</div>
          <div class="player-manage-name">${p.name}</div>
          <div class="player-manage-name">${formatAmount(p.chips)}</div>
          ${actionBtn}
        </div>
      `;
    }).join('');
    html += '</div>';
  }

  listEl.innerHTML = html;
}

function toZenkakuNumber(num) {
  return String(num).replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
}

function addPlayerFromMenu() {
  if (!gameState || !gameState.players) return;
  if (gameState.isHandActive) {
    alert('ハンド中はプレイヤー追加できません');
    return;
  }
  // leftプレイヤーを除いたアクティブプレイヤー数で制限
  const activePlayerCount = gameState.players.filter(p => p.status !== 'left').length;
  if (activePlayerCount >= 8) {
    alert('プレイヤーは最大8人です');
    return;
  }
  const nameInput = document.getElementById('player-manage-name');
  const chipsInput = document.getElementById('player-manage-chips');
  const rawName = (nameInput?.value || '').trim();
  const nextIndex = gameState.players.length + 1;
  const defaultName = `プレイヤー${toZenkakuNumber(nextIndex)}`;
  const name = rawName || defaultName;
  const chipsVal = parseInt(chipsInput?.value || '0', 10);
  const chips = Number.isFinite(chipsVal) && chipsVal >= 0 ? chipsVal : (currentGameSettings?.initialChips || 1000);
  const seatIndex = Math.max(0, ...gameState.players.map(p => Number.isFinite(p.seatIndex) ? p.seatIndex : 0)) + 1;
  const maxIdNum = Math.max(0, ...gameState.players.map(p => {
    const m = String(p.id || '').match(/player_(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }));
  const newPlayer = {
    id: `player_${maxIdNum + 1}`,
    name,
    characterId: '',
    chips,
    status: 'waiting',
    currentBet: 0,
    totalBet: 0,
    actedThisRound: false,
    seatIndex
  };
  gameState.players.push(newPlayer);
  recordPlayerChange('add', newPlayer);
  saveChipsBeforeHand();
  render();
  refreshNextHandChipStatus();
  if (onlineState.role === 'host') broadcastState();
  if (nameInput) nameInput.value = '';
  rebuildPlayerManageList();
}

function removePlayerFromMenu(playerId) {
  if (!gameState || !gameState.players) return;
  if (gameState.isHandActive) {
    alert('ハンド中は退席できません');
    return;
  }
  const idx = gameState.players.findIndex(p => p.id === playerId);
  if (idx === -1) return;
  const activeCount = gameState.players.filter(p => p.status !== 'left').length;
  if (activeCount <= 2) {
    alert('プレイヤーは最低2人必要です');
    return;
  }
  const player = gameState.players[idx];
  // leftステータスに変更（配列からは削除しない）
  player.status = 'left';
  recordPlayerChange('leave', player);
  saveChipsBeforeHand();
  render();
  refreshNextHandChipStatus();
  if (onlineState.role === 'host') broadcastState();
  rebuildPlayerManageList();
}

function returnFromSitout(playerId) {
  if (!gameState || !gameState.players) return;
  const player = gameState.players.find(p => p.id === playerId);
  if (!player || player.status !== 'sitout') return;

  // チップがある場合はactiveに戻す
  if (player.chips > 0) {
    player.status = 'active';
  } else {
    // チップがない場合はリバイが必要
    rebuyPlayer(playerId);
    return;
  }

  saveChipsBeforeHand();
  render();
  refreshNextHandChipStatus();
  if (onlineState.role === 'host') broadcastState();
  rebuildPlayerManageList();
}

function returnFromLeft(playerId) {
  if (!gameState || !gameState.players) return;
  if (gameState.isHandActive) {
    alert('ハンド中は着席できません');
    return;
  }
  const player = gameState.players.find(p => p.id === playerId);
  if (!player || player.status !== 'left') return;
  if (player.chips > 0) {
    player.status = 'active';
    recordPlayerChange('seat', player);
    saveChipsBeforeHand();
    render();
    refreshNextHandChipStatus();
    if (onlineState.role === 'host') broadcastState();
    rebuildPlayerManageList();
  } else {
    rebuyPlayer(playerId);
  }
}
function rebuyPlayer(playerId) {
  if (!gameState || !gameState.players) return;
  if (gameState.isHandActive) {
    alert('ハンド中はリバイできません');
    return;
  }
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  const defaultChips = currentGameSettings?.initialChips || 1000;
  const input = prompt(`${player.name} のリバイチップ数を入力:`, defaultChips);
  if (input === null) return;

  const chips = parseInt(input, 10);
  if (!Number.isFinite(chips) || chips <= 0) {
    alert('有効なチップ数を入力してください');
    return;
  }

  player.chips = chips;
  player.status = 'active';
  recordPlayerChange('rebuy', player);

  saveChipsBeforeHand();
  render();
  refreshNextHandChipStatus();
  if (onlineState.role === 'host') broadcastState();
  rebuildPlayerManageList();
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
  const results = gameState.players.map(p => {
    const before = chipsBeforeHand[p.id] ?? p.chips;
    const delta = p.chips - before;
    return {
      name: p.name,
      characterId: p.characterId,
      chips: p.chips,
      delta
    };
  });
  const losers = gameState.players.filter(p =>
    !winners.some(w => w.name === p.name) && (chipsBeforeHand[p.id] ?? p.chips) !== p.chips
  );
  handHistory.push({
    type: 'hand',
    hand: handHistory.length + 1,
    winners: winners.map(w => ({ name: w.name, characterId: w.characterId })),
    losers: losers.map(l => ({ name: l.name, characterId: l.characterId, loss: chipsBeforeHand[l.id] - l.chips })),
    pot: totalPot,
    results,
    at: Date.now()
  });
}

function recordChipAdjustment(changes) {
  if (!changes || changes.length === 0) return;
  handHistory.push({
    type: 'adjust',
    changes: changes.map(c => ({ name: c.name, from: c.from, to: c.to })),
    at: Date.now()
  });
}

function recordPlayerChange(action, player) {
  if (!player) return;
  handHistory.push({
    type: 'player',
    action,
    name: player.name || '—',
    characterId: player.characterId || '',
    chips: typeof player.chips === 'number' ? player.chips : null,
    at: Date.now()
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
        ${renderAvatarMarkup(winner.characterId || '', { sizeClass: 'avatar--sm', hideYou: true })}
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
  saveChipsBeforeHand();
  gameState = startHand(gameState);
  // Initialize offline display rotation to first acting player
  if (onlineState.role === 'local') {
    offlineDisplayFrontIdx = gameState.currentPlayerIndex;
    offlineLastActorId = null;
  }

  if (gameState.phase === 'finished') {
    showGameOver();
    return;
  }

  render();
  startActionTimer();
  if (onlineState.role === 'host') {
    broadcastState();
  }
  const tournamentBar = document.getElementById('tournament-bar');
  if (tournamentBar) {
    if (appMode === 'online' && tournamentSettings.enabled) {
      tournamentBar.style.display = 'flex';
      startTournamentTimer();
    } else {
      tournamentBar.style.display = 'none';
      stopTournamentTimer();
    }
  }
}

// ─── SETUP SCREEN LOGIC ───────────────────────
function addPlayer() {
  const inputs = document.getElementById('player-inputs');
  const current = inputs.querySelectorAll('.player-row').length;
  if (current >= 8) return;
  const playerNum = current + 1;
  const row = document.createElement('div');
  row.className = 'player-row';
  const zenkakuNum = String(playerNum).replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
  row.innerHTML = `<div class="player-name-row"><input type="text" class="player-name-input" placeholder="プレイヤー名" value="プレイヤー${zenkakuNum}"><button class="remove-btn" onclick="removePlayer(this)">×</button></div><div class="icon-picker"></div>`;
  inputs.appendChild(row);
  updateRemoveButtons();
  updateAddPlayerVisibility();
  refreshCharacterPickers();
}

function removePlayer(btn) {
  const inputs = document.querySelectorAll('.player-row');
  if (inputs.length <= 2) return; // 最低2人
  btn.closest('.player-row').remove();
  updateRemoveButtons();
  updateAddPlayerVisibility();
  refreshCharacterPickers();
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
    roomChannel.send({
      type: 'broadcast',
      event: 'start-game',
      payload: { settings, state: gameState, chipsBeforeHand: { ...chipsBeforeHand } }
    });
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

    savedData.slice(0, 8).forEach((entry, index) => {
      const rawName = typeof entry === 'string' ? entry : (entry?.name || '');
      const isDefaultLike = /^プレイヤー[0-9０-９]+$/.test(rawName || '');
      const defaultName = `プレイヤー${String(index + 1).replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0))}`;
      const name = rawName && !isDefaultLike ? rawName : defaultName;
      const characterId = typeof entry === 'string' ? '' : (entry?.characterId || entry?.icon || '');
      const row = document.createElement('div');
      row.className = 'player-row';
      row.dataset.characterId = normalizeCharacterId(characterId, index);
      row.innerHTML = `<div class="player-name-row"><input type="text" class="player-name-input" placeholder="プレイヤー名" value="${name}"><button class="remove-btn" onclick="removePlayer(this)">×</button></div><div class="icon-picker"></div>`;
      container.appendChild(row);
    });
    updateRemoveButtons();
    updateAddPlayerVisibility();
    refreshCharacterPickers();
  } catch (e) {
    console.log('Failed to load saved player names:', e);
  }
}

// ランダム表示名生成（ポーカー風のニックネーム）
function generateRandomName() {
  const animals = ['Fox', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Owl', 'Cat', 'Dog'];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${animal}${num}`;
}

  const CHARACTERS = [
    { id: 'chara1', src: 'img/chara1.png', label: 'Chara 1' },
    { id: 'chara2', src: 'img/chara2.png', label: 'Chara 2' },
    { id: 'chara3', src: 'img/chara3.png', label: 'Chara 3' },
    { id: 'chara4', src: 'img/chara4.png', label: 'Chara 4' },
    { id: 'chara5', src: 'img/chara5.png', label: 'Chara 5' },
    { id: 'chara6', src: 'img/chara6.png', label: 'Chara 6' },
    { id: 'coming-soon', src: '', label: 'Comming Soon...' }
  ];
  const CHARACTER_IDS = new Set(CHARACTERS.filter(c => c.id !== 'coming-soon').map(c => c.id));
const DEFAULT_CHARACTER_ID = 'chara1';
const LEGACY_ICON_MAP = {
  'char-01': 'chara1',
  'char-02': 'chara2',
  'char-03': 'chara3',
  'char-04': 'chara4',
  'char-05': 'chara5',
  'char-06': 'chara6'
};

function getCharacterSrc(id) {
  const found = CHARACTERS.find(c => c.id === id);
  return found ? found.src : 'img/chara1.png';
}

function normalizeCharacterId(id, fallbackIndex = 0) {
  if (id && LEGACY_ICON_MAP[id]) return LEGACY_ICON_MAP[id];
  if (id && CHARACTER_IDS.has(id)) return id;
  const fallback = CHARACTERS[fallbackIndex % CHARACTERS.length];
  return fallback ? fallback.id : DEFAULT_CHARACTER_ID;
}

function renderAvatarMarkup(characterId, options = {}) {
  const {
    isYou = false,
    isDealer = false,
    isTurn = false,
    isWinner = false,
    sizeClass = '',
    hideYou = false,
    fallbackIndex = 0,
    extraClass = ''
  } = options;
  const safeId = normalizeCharacterId(characterId, fallbackIndex);
  const classes = [
    'avatar-wrap',
    sizeClass,
    extraClass,
    isYou ? 'is-you' : '',
    isDealer ? 'is-dealer' : '',
    isTurn ? 'is-turn' : '',
    isWinner ? 'is-winner' : ''
  ].filter(Boolean).join(' ');
  const youPill = isYou && !hideYou
    ? '<span class="you-pill" aria-label="you">YOU</span>'
    : '';
  return `
    <div class="${classes}">
      <img class="avatar-img" src="${getCharacterSrc(safeId)}" alt="avatar" loading="lazy" onerror="this.onerror=null;this.src='img/chara1.png';">
      ${youPill}
    </div>
  `;
}

function isPlayerYou(player, index) {
  if (!player) return false;
  if (appMode === 'offline' || onlineState.role === 'local') {
    if (onlineState.localPlayerId && player.id === onlineState.localPlayerId) return true;
    if (player.name && onlineState.displayName && player.name === onlineState.displayName) return true;
    return index === 0;
  }
  return !!(player.name && onlineState.displayName && player.name === onlineState.displayName);
}

function isPresenceYou(p, index) {
  if (!p) return false;
  if (p.name && onlineState.displayName && p.name === onlineState.displayName) return true;
  if (onlineState.seat && p.seat && String(p.seat) === String(onlineState.seat)) return true;
  if (appMode === 'offline' || onlineState.role === 'local') return index === 0;
  return false;
}

function syncLocalPlayerIdentityFromState() {
  if (!gameState || !Array.isArray(gameState.players)) return;
  const byName = gameState.players.find(p => p.name === onlineState.displayName);
  if (byName) {
    onlineState.localPlayerId = byName.id;
    onlineState.characterId = byName.characterId || onlineState.characterId;
    return;
  }
  if ((appMode === 'offline' || onlineState.role === 'local') && !onlineState.localPlayerId) {
    const fallback = gameState.players[0];
    if (fallback) {
      onlineState.localPlayerId = fallback.id;
      onlineState.characterId = fallback.characterId || onlineState.characterId;
    }
  }
}

function buildCharacterPicker(row, selectedId, index) {
  const picker = row.querySelector('.icon-picker');
  if (!picker) return;
  const fallback = normalizeCharacterId('', index);
  const candidate = selectedId || row.dataset.characterId || fallback;
  const current = normalizeCharacterId(candidate, index);
  row.dataset.characterId = current;
  picker.innerHTML = '';
  CHARACTERS.forEach((chara) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (chara.id === 'coming-soon') {
      btn.className = 'icon-btn coming-soon';
      btn.disabled = true;
      btn.setAttribute('aria-label', chara.label);
      btn.textContent = chara.label;
      picker.appendChild(btn);
      return;
    }
    btn.className = 'icon-btn character-btn' + (chara.id === current ? ' selected' : '');
    btn.dataset.characterId = chara.id;
    btn.setAttribute('aria-label', chara.label);
    btn.innerHTML = `
      <img src="${chara.src}" alt="${chara.label}" loading="lazy" onerror="this.onerror=null;this.src='img/chara1.png';">
    `;
    btn.addEventListener('click', () => {
      row.dataset.characterId = chara.id;
      picker.querySelectorAll('.character-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.characterId === chara.id);
      });
    }, { passive: true });
    picker.appendChild(btn);
  });
}

function refreshCharacterPickers() {
  const rows = document.querySelectorAll('.player-row');
  rows.forEach((row, i) => buildCharacterPicker(row, row.dataset.characterId, i));
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll('.player-row');
  rows.forEach((row, i) => {
    const btn = row.querySelector('.remove-btn');
    if (i < 2) {
      if (btn) btn.remove();
    } else if (!btn) {
      const newBtn = document.createElement('button');
      newBtn.className = 'remove-btn';
      newBtn.textContent = '×';
      newBtn.addEventListener('click', () => removePlayer(newBtn));
      const nameRow = row.querySelector('.player-name-row');
      const input = row.querySelector('.player-name-input');
      if (nameRow && input) {
        input.insertAdjacentElement('afterend', newBtn);
        nameRow.appendChild(newBtn);
      } else if (input) {
        input.insertAdjacentElement('afterend', newBtn);
      } else {
        row.appendChild(newBtn);
      }
    }
  });
}

function updateAddPlayerVisibility() {
  const addBtn = document.querySelector('.add-player-btn');
  const inputs = document.querySelectorAll('.player-row');
  if (!addBtn) return;
  addBtn.style.display = inputs.length >= 8 ? 'none' : 'block';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    const seatLayoutRefresh = typeof scheduleSeatLayoutRefresh === 'function'
      ? scheduleSeatLayoutRefresh
      : () => {
        showBootError(new Error('scheduleSeatLayoutRefresh is not available'));
      };
    window.addEventListener('resize', seatLayoutRefresh, { passive: true });
    window.addEventListener('orientationchange', seatLayoutRefresh, { passive: true });
    if (isDebugEnabled()) {
      const logPointer = (e) => {
        const target = e.target;
        const path = typeof e.composedPath === 'function' ? e.composedPath().slice(0, 6) : [];
        const pathSummary = path.map((node) => {
          if (!node || !node.tagName) return String(node);
          const id = node.id ? `#${node.id}` : '';
          const cls = node.className ? `.${String(node.className).split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
          return `${node.tagName.toLowerCase()}${id}${cls}`;
        });
        const point = ('clientX' in e && 'clientY' in e) ? { x: e.clientX, y: e.clientY } : null;
        const hit = point ? document.elementFromPoint(point.x, point.y) : null;
        console.log('[debug-click]', {
          type: e.type,
          target,
          path: pathSummary,
          elementFromPoint: hit
        });
      };
      document.addEventListener('pointerdown', logPointer, { passive: true });
      document.addEventListener('click', logPointer, { passive: true });
    }
    loadSavedPlayerNames();
    refreshCharacterPickers();
    updateRemoveButtons();
    updateAddPlayerVisibility();
    setUiState('room');
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;
    const headerVersionEl = document.querySelector('.game-header-version');
    if (headerVersionEl) headerVersionEl.textContent = APP_VERSION;
    setupNumericInput(document.getElementById('sb-input'));
    setupNumericInput(document.getElementById('bb-input'));
    setupNumericInput(document.getElementById('initial-chips-input'));
    const tournamentToggle = document.getElementById('tournament-mode-toggle');
    if (tournamentToggle) {
      bindOnce(tournamentToggle, 'change', syncTournamentOptions);
    }
    syncTournamentOptions();
    updateTournamentUiVisibility();

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
          appMode = 'online';
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
          appMode = 'online';
          setUiState('waiting');
          updateParticipantList();
        }
      });
    }
    if (localBtn) {
      localBtn.addEventListener('click', async () => {
        const fallbackName = nameInput ? nameInput.value.trim() : '';
        await resetOnlineStateForOffline(fallbackName);
        onlineState.displayName = fallbackName || onlineState.displayName;
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
        displayToggleBtn.textContent = `表記切替: ${displayMode === 'bb' ? 'BB' : 'CHIP'}`;
      });
    }
    const menuHistoryBtn = document.getElementById('menu-history-btn');
    if (menuHistoryBtn) {
      menuHistoryBtn.addEventListener('click', () => {
        showHistory();
      });
    }
    const menuChipAdjustBtn = document.getElementById('menu-chip-adjust-btn');
    if (menuChipAdjustBtn) {
      menuChipAdjustBtn.addEventListener('click', () => {
        showChipAdjust();
      });
    }
    const menuPlayerManageBtn = document.getElementById('menu-player-manage-btn');
    if (menuPlayerManageBtn) {
      menuPlayerManageBtn.addEventListener('click', () => {
        showPlayerManage();
      });
    }
    const menuSoundToggle = document.getElementById('menu-sound-toggle');
    if (menuSoundToggle) {
      menuSoundToggle.textContent = `音量: ${timerSettings.soundEnabled ? 'ON' : 'OFF'}`;
      menuSoundToggle.addEventListener('click', () => {
        timerSettings.soundEnabled = !timerSettings.soundEnabled;
        const toggle = document.getElementById('timer-sound-toggle');
        if (toggle) toggle.checked = timerSettings.soundEnabled;
        menuSoundToggle.textContent = `音量: ${timerSettings.soundEnabled ? 'ON' : 'OFF'}`;
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

    ensureDebugBanner();

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
  } catch (err) {
    showBootError(err);
  }
});

function resetToSetup() {
  document.getElementById('showdown-overlay').classList.remove('visible');
  document.getElementById('next-hand-overlay').classList.remove('visible');
  document.getElementById('fold-confirm-overlay').classList.remove('visible');
  stopActionTimer();
  stopTournamentTimer();
  gameState = null;
  if (onlineState.role !== 'local') {
    leaveRoom();
  } else {
    setUiState('room');
  }
}

function showFileProtocolWarning() {
  if (document.getElementById('file-protocol-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'file-protocol-banner';
  banner.textContent = 'Run via http://localhost (e.g., npx http-server) for PWA/SW features.';
  banner.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.7); color: #fff; padding: 8px 12px;
    border-radius: 8px; font-size: 12px; z-index: 9999;
    font-family: inherit; letter-spacing: 0.2px;
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

function disableManifestForFileProtocol() {
  if (location.protocol !== 'file:') return;
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink && manifestLink.parentNode) {
    manifestLink.parentNode.removeChild(manifestLink);
  }
  if (isDebugEnabled()) {
    console.warn('[env] manifest disabled for file://');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (location.protocol === 'file:') {
    disableManifestForFileProtocol();
    showFileProtocolWarning();
  }
});

// ─── SERVICE WORKER & UPDATE NOTIFICATION ─────
let pendingWorker = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      if (location.protocol === 'file:') showFileProtocolWarning();
      if (isDebugEnabled()) {
        console.warn('[env] skip SW registration for', location.protocol);
      }
      return;
    }
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('SW registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            pendingWorker = newWorker;
            showUpdateNotification();
          }
        });
      });
    }).catch(err => console.log('SW registration failed:', err));
  });
}

function showUpdateNotification() {
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.style.display = 'flex';
  }
}

function applyUpdate() {
  if (pendingWorker) {
    pendingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
  // Reload after a short delay to allow SW to activate
  setTimeout(() => location.reload(), 300);
}
