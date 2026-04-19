// Blackjack-21 engine. Pure, no React, no DOM.
//
// Supports two modes:
//   - 'solo' — you vs a scripted dealer (bot). Drives betting + balance locally.
//   - 'versus' — you vs a friend over P2P. Engine still owns the deck + state,
//     but UI sends peer-authored action events via the net layer; the engine
//     applies them identically on both sides because both use the same seed.
//
// Rules implemented for solo:
//   - Single 52-card deck, re-shuffled each deal.
//   - Ace = 11, downgraded to 1 per-ace if the hand is busting.
//   - Dealer stands on any 17 (hits soft 17 off — kind to the player).
//   - Natural blackjack on the opening two cards beats a normal 21 and ends
//     the hand immediately; mutual naturals push.
//   - Doubling: allowed on the opening 2 cards; doubles the bet and draws
//     exactly one more card before forcing stand.
//   - Split: stubbed out (UI button is always disabled) — kept in the action
//     list for design parity with the mockup.
//
// For the versus mode, each hand is "player vs opponent" — both try to get
// as close to 21 as possible without busting. Highest final value ≤ 21 wins
// the pot. Ties push. Each side sees every card (no hidden hole); the shared
// deck seed keeps the draw order identical on both clients.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

const DEFAULT_BALANCE = 3000;
const DEFAULT_BET = 75;
const MIN_BET = 25;
const BET_STEP = 25;

let idCounter = 0;

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: ++idCounter });
    }
  }
  return deck;
}

// Tiny, dependency-free seeded RNG. `mulberry32` — good enough for a shared
// card order across two peers.
function hashStringToSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Best hand value ≤ 21 when possible; otherwise the lowest (busted) value.
export function handValue(hand) {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { sum += 11; aces++; }
    else if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') sum += 10;
    else sum += Number(c.rank);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}

export function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

export const BLACKJACK_CONSTANTS = {
  DEFAULT_BALANCE,
  DEFAULT_BET,
  MIN_BET,
  BET_STEP,
};

// ─── Solo engine ──────────────────────────────────────────────────────────

export function createEngine({ startingBalance = DEFAULT_BALANCE } = {}) {
  const state = {
    mode: 'solo',
    deck: [],
    player: [],
    dealer: [],
    // 'idle'         — pre-game, no cards yet
    // 'player'       — waiting for player to hit / stand / double
    // 'dealerReveal' — stand was pressed, hole card about to flip
    // 'dealer'       — dealer drawing cards
    // 'done'         — round finished, result is set
    phase: 'idle',
    result: null, // 'blackjack' | 'player' | 'dealer' | 'push' | 'bust' | 'dealerBust'
    round: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    events: [],

    // Bank ledger
    balance: Number.isFinite(startingBalance) ? startingBalance : DEFAULT_BALANCE,
    bet: DEFAULT_BET,
    pot: 0,
    doubled: false,
    lastDelta: 0, // +pot on win, -pot on loss, 0 on push (for UI flash)
  };

  function draw() {
    if (state.deck.length === 0) state.deck = shuffle(createDeck());
    return state.deck.pop();
  }

  function setBet(next) {
    if (state.phase !== 'idle' && state.phase !== 'done') return false;
    const n = Math.max(MIN_BET, Math.min(Math.floor(next / BET_STEP) * BET_STEP, state.balance));
    state.bet = n;
    return true;
  }
  function adjustBet(delta) {
    return setBet(state.bet + delta);
  }

  function deal() {
    if (state.balance < state.bet) return false;
    state.deck = shuffle(createDeck());
    state.player = [draw(), draw()];
    state.dealer = [draw(), draw()];
    state.result = null;
    state.round++;
    state.doubled = false;
    state.lastDelta = 0;
    state.balance -= state.bet;
    state.pot = state.bet * 2; // dealer (house) matches the player's stake
    state.events.push({ type: 'deal' });

    const pBj = isBlackjack(state.player);
    const dBj = isBlackjack(state.dealer);
    if (pBj && dBj) {
      state.phase = 'done';
      state.result = 'push';
      state.pushes++;
      state.events.push({ type: 'reveal' });
      state.events.push({ type: 'push' });
      settle('push');
    } else if (pBj) {
      state.phase = 'done';
      state.result = 'blackjack';
      state.wins++;
      state.events.push({ type: 'blackjack' });
      settle('blackjack');
    } else if (dBj) {
      state.phase = 'done';
      state.result = 'dealer';
      state.losses++;
      state.events.push({ type: 'reveal' });
      state.events.push({ type: 'lose' });
      settle('dealer');
    } else {
      state.phase = 'player';
    }
    return true;
  }

  function settle(outcome) {
    // Translate outcomes to balance changes. Natural blackjack pays 3:2 like
    // a casino, normal wins pay 1:1, pushes return the stake.
    if (outcome === 'blackjack') {
      const winnings = Math.floor(state.bet * 2.5);
      state.balance += winnings;
      state.lastDelta = winnings - state.bet;
      state.pot = 0;
    } else if (outcome === 'player' || outcome === 'dealerBust') {
      state.balance += state.pot;
      state.lastDelta = state.pot - state.bet;
      state.pot = 0;
    } else if (outcome === 'push') {
      state.balance += state.bet;
      state.lastDelta = 0;
      state.pot = 0;
    } else {
      // 'dealer' win or 'bust' — stake already removed; pot lost to house.
      state.lastDelta = -state.bet;
      state.pot = 0;
    }
    if (state.balance < MIN_BET) state.balance = MIN_BET; // prevent soft-lock
  }

  function hit() {
    if (state.phase !== 'player') return false;
    const card = draw();
    state.player.push(card);
    state.events.push({ type: 'hit', card });
    const v = handValue(state.player);
    if (v > 21) {
      state.phase = 'done';
      state.result = 'bust';
      state.losses++;
      state.events.push({ type: 'bust' });
      settle('bust');
    }
    return true;
  }

  function canDouble() {
    return state.phase === 'player'
      && state.player.length === 2
      && !state.doubled
      && state.balance >= state.bet;
  }

  function doubleDown() {
    if (!canDouble()) return false;
    // Put a second stake on the line, draw exactly one more card, then stand.
    state.balance -= state.bet;
    state.pot += state.bet * 2;
    state.bet *= 2;
    state.doubled = true;
    state.events.push({ type: 'double' });
    const card = draw();
    state.player.push(card);
    state.events.push({ type: 'hit', card });
    const v = handValue(state.player);
    if (v > 21) {
      state.phase = 'done';
      state.result = 'bust';
      state.losses++;
      state.events.push({ type: 'bust' });
      settle('bust');
      return true;
    }
    state.phase = 'dealerReveal';
    state.events.push({ type: 'reveal' });
    return true;
  }

  function stand() {
    if (state.phase !== 'player') return false;
    state.phase = 'dealerReveal';
    state.events.push({ type: 'reveal' });
    return true;
  }

  function startDealerTurn() {
    if (state.phase !== 'dealerReveal') return false;
    state.phase = 'dealer';
    return true;
  }

  function dealerStep() {
    if (state.phase !== 'dealer') return false;
    const v = handValue(state.dealer);
    if (v < 17) {
      const card = draw();
      state.dealer.push(card);
      state.events.push({ type: 'dealerHit', card });
      return true;
    }
    return false;
  }

  function resolve() {
    if (state.phase !== 'dealer') return false;
    const pv = handValue(state.player);
    const dv = handValue(state.dealer);
    state.phase = 'done';
    if (dv > 21) {
      state.result = 'dealerBust';
      state.wins++;
      state.events.push({ type: 'win' });
      settle('dealerBust');
    } else if (pv > dv) {
      state.result = 'player';
      state.wins++;
      state.events.push({ type: 'win' });
      settle('player');
    } else if (pv === dv) {
      state.result = 'push';
      state.pushes++;
      state.events.push({ type: 'push' });
      settle('push');
    } else {
      state.result = 'dealer';
      state.losses++;
      state.events.push({ type: 'lose' });
      settle('dealer');
    }
    return true;
  }

  function reset() {
    state.deck = [];
    state.player = [];
    state.dealer = [];
    state.phase = 'idle';
    state.result = null;
    state.round = 0;
    state.wins = 0;
    state.losses = 0;
    state.pushes = 0;
    state.events = [];
    state.balance = DEFAULT_BALANCE;
    state.bet = DEFAULT_BET;
    state.pot = 0;
    state.doubled = false;
    state.lastDelta = 0;
  }

  function snapshot() {
    const dealerVisible = state.dealer.length > 0 ? handValue([state.dealer[0]]) : 0;
    return {
      mode: 'solo',
      player: state.player.slice(),
      dealer: state.dealer.slice(),
      phase: state.phase,
      result: state.result,
      round: state.round,
      wins: state.wins,
      losses: state.losses,
      pushes: state.pushes,
      playerValue: handValue(state.player),
      dealerValue: handValue(state.dealer),
      dealerVisibleValue: dealerVisible,
      balance: state.balance,
      bet: state.bet,
      pot: state.pot,
      doubled: state.doubled,
      lastDelta: state.lastDelta,
      canDouble: canDouble(),
    };
  }

  function drainEvents() {
    const out = state.events;
    state.events = [];
    return out;
  }

  return {
    deal, hit, stand, startDealerTurn, dealerStep, resolve, reset,
    doubleDown, setBet, adjustBet,
    snapshot, drainEvents
  };
}


// ─── PvP engine ───────────────────────────────────────────────────────────
//
// Host-authoritative by construction: both peers derive the same shuffle from
// a shared seed, and the engine keeps the canonical turn/phase state machine.
// The UI layer is responsible for sending the opponent's moves over the wire
// and invoking `applyRemoteAction` on receipt.

export function createPvpEngine({
  seed,
  youId,
  oppId,
  youName,
  oppName,
  startingBalance = DEFAULT_BALANCE,
  firstTurn = 'you',
} = {}) {
  const rngSeed = hashStringToSeed(String(seed || `${youId}|${oppId}|0`));
  const rng = mulberry32(rngSeed);

  const state = {
    mode: 'versus',
    seed: String(seed || ''),
    youId, oppId,
    youName: youName || 'Ты',
    oppName: oppName || 'Соперник',
    firstTurn,
    deck: [],
    you: [],
    opp: [],
    // 'idle'     — before first round
    // 'you'      — your turn to act
    // 'opp'      — opponent's turn
    // 'reveal'   — both stood or busted; showing result animation
    // 'done'     — round ended
    phase: 'idle',
    // per-side end flag: 'playing' | 'stand' | 'bust' | 'blackjack' | 'double'
    youStatus: 'playing',
    oppStatus: 'playing',
    result: null, // 'you' | 'opp' | 'push'
    round: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    events: [],

    youBalance: startingBalance,
    oppBalance: startingBalance,
    bet: DEFAULT_BET,
    pot: 0,
    youDoubled: false,
    oppDoubled: false,
    lastDelta: 0,
  };

  function nextCard() {
    if (state.deck.length === 0) state.deck = shuffle(createDeck(), rng);
    return state.deck.pop();
  }

  function bothLockedIn() {
    return state.youStatus !== 'playing' && state.oppStatus !== 'playing';
  }

  function advanceTurn() {
    if (state.phase === 'reveal' || state.phase === 'done') return;
    if (bothLockedIn()) {
      state.phase = 'reveal';
      state.events.push({ type: 'reveal' });
      return;
    }
    // Whose turn next?
    const other = state.phase === 'you' ? 'opp' : 'you';
    if (state[other + 'Status'] === 'playing') state.phase = other;
    // If the other side already stood, keep current player moving.
  }

  function setBet(next) {
    if (state.phase !== 'idle' && state.phase !== 'done') return false;
    const cap = Math.max(MIN_BET, Math.min(state.youBalance, state.oppBalance));
    const n = Math.max(MIN_BET, Math.min(Math.floor(next / BET_STEP) * BET_STEP, cap));
    state.bet = n;
    return true;
  }
  function adjustBet(delta) { return setBet(state.bet + delta); }

  function deal() {
    if (state.youBalance < state.bet || state.oppBalance < state.bet) return false;
    state.deck = shuffle(createDeck(), rng);
    state.you = [nextCard(), nextCard()];
    state.opp = [nextCard(), nextCard()];
    state.result = null;
    state.round++;
    state.youDoubled = false;
    state.oppDoubled = false;
    state.lastDelta = 0;
    state.youStatus = 'playing';
    state.oppStatus = 'playing';
    state.youBalance -= state.bet;
    state.oppBalance -= state.bet;
    state.pot = state.bet * 2;
    state.events.push({ type: 'deal' });

    const youBj = isBlackjack(state.you);
    const oppBj = isBlackjack(state.opp);
    if (youBj) state.youStatus = 'blackjack';
    if (oppBj) state.oppStatus = 'blackjack';
    if (youBj || oppBj) {
      // If either has natural, skip straight to reveal.
      state.phase = 'reveal';
      state.events.push({ type: 'reveal' });
      return true;
    }
    state.phase = state.firstTurn === 'opp' ? 'opp' : 'you';
    return true;
  }

  function settle() {
    const yv = handValue(state.you);
    const ov = handValue(state.opp);
    const youBust = state.youStatus === 'bust';
    const oppBust = state.oppStatus === 'bust';

    let outcome; // 'you' | 'opp' | 'push'
    if (youBust && oppBust) outcome = 'push';
    else if (youBust) outcome = 'opp';
    else if (oppBust) outcome = 'you';
    else if (yv > ov) outcome = 'you';
    else if (ov > yv) outcome = 'opp';
    else outcome = 'push';

    state.result = outcome;
    if (outcome === 'you') {
      state.youBalance += state.pot;
      state.lastDelta = state.pot - state.bet;
      state.wins++;
      state.events.push({ type: 'win' });
    } else if (outcome === 'opp') {
      state.oppBalance += state.pot;
      state.lastDelta = -state.bet;
      state.losses++;
      state.events.push({ type: 'lose' });
    } else {
      state.youBalance += state.bet;
      state.oppBalance += state.bet;
      state.lastDelta = 0;
      state.pushes++;
      state.events.push({ type: 'push' });
    }
    state.pot = 0;
    state.phase = 'done';
  }

  function doReveal() {
    if (state.phase !== 'reveal') return false;
    settle();
    return true;
  }

  function hit(side) {
    if (state.phase !== side) return false;
    if (state[side + 'Status'] !== 'playing') return false;
    const card = nextCard();
    state[side].push(card);
    state.events.push({ type: 'hit', side, card });
    const v = handValue(state[side]);
    if (v > 21) {
      state[side + 'Status'] = 'bust';
      state.events.push({ type: 'bust', side });
    }
    advanceTurn();
    return true;
  }

  function stand(side) {
    if (state.phase !== side) return false;
    if (state[side + 'Status'] !== 'playing') return false;
    state[side + 'Status'] = 'stand';
    state.events.push({ type: 'stand', side });
    advanceTurn();
    return true;
  }

  function canDouble(side) {
    const bal = side === 'you' ? state.youBalance : state.oppBalance;
    return state.phase === side
      && state[side].length === 2
      && state[side + 'Status'] === 'playing'
      && !state[side + 'Doubled']
      && bal >= state.bet;
  }

  function doubleDown(side) {
    if (!canDouble(side)) return false;
    const doubleKey = side + 'Doubled';
    const balKey = side + 'Balance';
    state[balKey] -= state.bet;
    state.pot += state.bet; // only doubler puts up more — the pot reflects exact stakes
    state[doubleKey] = true;
    state.events.push({ type: 'double', side });
    const card = nextCard();
    state[side].push(card);
    state.events.push({ type: 'hit', side, card });
    const v = handValue(state[side]);
    if (v > 21) state[side + 'Status'] = 'bust';
    else state[side + 'Status'] = 'stand';
    state.events.push({ type: state[side + 'Status'] === 'bust' ? 'bust' : 'stand', side });
    advanceTurn();
    return true;
  }

  // Apply an incoming action from the remote peer (acting for 'opp' from our
  // perspective). Returns true if the action was applicable.
  function applyRemoteAction(action) {
    if (!action || typeof action !== 'object') return false;
    if (action.kind === 'hit') return hit('opp');
    if (action.kind === 'stand') return stand('opp');
    if (action.kind === 'double') return doubleDown('opp');
    if (action.kind === 'bet' && Number.isFinite(action.value)) return setBet(action.value);
    if (action.kind === 'deal') return deal();
    return false;
  }

  function snapshot() {
    return {
      mode: 'versus',
      seed: state.seed,
      youId: state.youId,
      oppId: state.oppId,
      youName: state.youName,
      oppName: state.oppName,
      you: state.you.slice(),
      opp: state.opp.slice(),
      youStatus: state.youStatus,
      oppStatus: state.oppStatus,
      phase: state.phase,
      result: state.result,
      round: state.round,
      wins: state.wins,
      losses: state.losses,
      pushes: state.pushes,
      youValue: handValue(state.you),
      oppValue: handValue(state.opp),
      youBalance: state.youBalance,
      oppBalance: state.oppBalance,
      bet: state.bet,
      pot: state.pot,
      youDoubled: state.youDoubled,
      oppDoubled: state.oppDoubled,
      lastDelta: state.lastDelta,
      canDouble: canDouble('you'),
    };
  }

  function drainEvents() {
    const out = state.events;
    state.events = [];
    return out;
  }

  return {
    deal, hit, stand, doubleDown, applyRemoteAction,
    setBet, adjustBet, doReveal,
    snapshot, drainEvents,
  };
}
