import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateTai, calculatePayments, getNextDealerPlayerId } from './scoring';
import { Player, ScoredHand, CompletedGame } from './types';

const HISTORY_KEY = 'mahjong_game_history';
const ALLTIME_KEY = 'mahjong_alltime_totals';

interface AllTimeEntry { name: string; total: number; games: number; }
type AllTimeTotals = Record<string, AllTimeEntry>;

// ─── Utilities ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, weight] of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

// ─── Hand Simulator ───────────────────────────────────────────────────────────

function simulateHand(
  players: Player[],
  dealerPlayerId: string,
  stakePerTai: number,
): ScoredHand {
  const isRare = Math.random() < 0.20;
  const winner = pick(players);
  const opponents = players.filter(p => p.id !== winner.id);
  const isSelfDraw = Math.random() < 0.65;
  const discarder = isSelfDraw ? undefined : pick(opponents);
  const isDealer = winner.id === dealerPlayerId;

  const patternIds: string[] = [];
  if (isSelfDraw) patternIds.push('zi_mo');

  const flowerCount = weighted<number>([
    [0, 15], [1, 30], [2, 30], [3, 15], [4, 7], [5, 3],
  ]);
  const noHonors = Math.random() < 0.25;

  function addFlowerHonors(fc: number, nh: boolean) {
    if (fc === 0 && nh) patternIds.push('wu_hua_wu_zi');
    else if (fc === 0) patternIds.push('wu_hua');
    else if (nh) patternIds.push('wu_zi');
  }

  let effectiveFlowerCount = flowerCount;

  if (!isRare) {
    addFlowerHonors(flowerCount, noHonors);
    if (Math.random() < 0.35) patternIds.push('men_qing');
    if (Math.random() < 0.20) patternIds.push('du_ting');
    // yi_mo_san: 3 bonus tai stacked on top of men_qing + self-draw
    if (isSelfDraw && patternIds.includes('men_qing') && Math.random() < 0.20) {
      patternIds.push('yi_mo_san');
    }
  } else {
    const rare = weighted<string>([
      ['xiao_ping_hu',  20],  //  3 tai
      ['dui_dui_hu',    12],  // 10 tai
      ['cou_yi_se',     10],  // 10 tai
      ['da_ping_hu',    10],  // 10 tai (no flowers — included)
      ['san_an_kan',     8],  //  5 tai
      ['san_feng_peng',  8],  // 15 tai
      ['san_lian_peng',  6],  //  5 tai
      ['ba_dui_ban',     6],  // 20 tai
      ['xiao_hu',        9],  // special: caps entire hand at 1 tai
      ['xiao_san_yuan',  5],  // 20 tai
      ['qing_yi_se',     4],  // 50 tai
      ['da_san_yuan',    2],  // 40 tai
    ]);

    if (rare === 'da_ping_hu') {
      // da_ping_hu includes 無花無字 — flowers and honors must be 0
      patternIds.push('da_ping_hu');
      effectiveFlowerCount = 0;
    } else if (rare === 'xiao_hu') {
      // xiao_hu caps entire hand at 1 tai — no other patterns matter
      patternIds.push('xiao_hu');
      effectiveFlowerCount = 0;
    } else {
      patternIds.push(rare);
      addFlowerHonors(flowerCount, noHonors);
      if (Math.random() < 0.30) patternIds.push('men_qing');
    }
  }

  const totalTai = calculateTai(patternIds, effectiveFlowerCount, isDealer, isSelfDraw, {});

  const hand: ScoredHand = {
    winnerId: winner.id,
    drawMethod: isSelfDraw ? 'self' : 'discard',
    discarderId: discarder?.id,
    selectedPatternIds: patternIds,
    flowerCount: effectiveFlowerCount,
    totalTai,
    payments: [],
    dealerPlayerId,
  };
  hand.payments = calculatePayments(hand, players, stakePerTai);
  return hand;
}

// ─── Session Simulator ────────────────────────────────────────────────────────

function simulateSession(
  basePlayers: Player[],
  stakePerTai: number,
  sessionDate: Date,
): CompletedGame {
  const handCount = 15 + Math.floor(Math.random() * 11); // 15–25 hands
  let players = basePlayers.map(p => ({ ...p, score: 0 }));
  let dealerPlayerId = basePlayers[0].id;

  for (let i = 0; i < handCount; i++) {
    const hand = simulateHand(players, dealerPlayerId, stakePerTai);
    players = players.map(p => {
      const paid = hand.payments.find(pay => pay.fromPlayerId === p.id);
      const recv = hand.payments.find(pay => pay.toPlayerId === p.id);
      const delta = (recv ? recv.amount * hand.payments.length : 0)
                  - (paid ? paid.amount : 0);
      return { ...p, score: Math.round((p.score + delta) * 100) / 100 };
    });
    dealerPlayerId = getNextDealerPlayerId(players, dealerPlayerId, hand.winnerId);
  }

  return {
    id: `sim_${sessionDate.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    completedAt: sessionDate.toISOString(),
    players,
    totalHands: handCount,
    stakePerTai,
  };
}

// ─── Random Hand Config (for Score Hand UI testing) ──────────────────────────
//
// Returns the raw UI inputs needed to pre-fill the Score Hand screen.
// Caller sets these directly into component state — no AsyncStorage round-trip.
// Excludes zi_mo (driven by isSelfDraw) and flower/honor patterns (auto-built
// in handleScore). Countable patterns go into patternCounts only.

export interface RandomHandConfig {
  selectedIds: string[];
  patternCounts: Record<string, number>;
  flowerCount: number;
  noHonors: boolean;
  isSelfDraw: boolean;
}

export function generateRandomHandConfig(): RandomHandConfig {
  const isRare = Math.random() < 0.20;
  const isSelfDraw = Math.random() < 0.65;
  const selectedIds: string[] = [];
  const patternCounts: Record<string, number> = {};

  let flowerCount = weighted<number>([
    [0, 15], [1, 30], [2, 30], [3, 15], [4, 7], [5, 3],
  ]);
  let noHonors = Math.random() < 0.25;

  if (!isRare) {
    if (Math.random() < 0.35) selectedIds.push('men_qing');
    if (Math.random() < 0.20) selectedIds.push('du_ting');
    if (isSelfDraw && selectedIds.includes('men_qing') && Math.random() < 0.20) {
      selectedIds.push('yi_mo_san');
    }
    // Occasional kongs — go into patternCounts (counter UI), not selectedIds
    if (Math.random() < 0.12) {
      const type = Math.random() < 0.6 ? 'ming_gang' : 'an_gang';
      patternCounts[type] = Math.random() < 0.7 ? 1 : 2;
    }
  } else {
    const rare = weighted<string>([
      ['xiao_ping_hu',  20],
      ['dui_dui_hu',    12],
      ['cou_yi_se',     10],
      ['da_ping_hu',    10],
      ['san_an_kan',     8],
      ['san_feng_peng',  8],
      ['san_lian_peng',  6],
      ['ba_dui_ban',     6],
      ['xiao_hu',        9],
      ['xiao_san_yuan',  5],
      ['qing_yi_se',     4],
      ['da_san_yuan',    2],
    ]);
    selectedIds.push(rare);

    if (rare === 'da_ping_hu') {
      // da_ping_hu already includes 無花無字
      flowerCount = 0;
      noHonors = false;
    } else if (rare === 'xiao_hu') {
      // xiao_hu caps at 1 tai — other inputs irrelevant but still show them
      flowerCount = 0;
    } else if (Math.random() < 0.30) {
      selectedIds.push('men_qing');
    }
  }

  return { selectedIds, patternCounts, flowerCount, noHonors, isSelfDraw };
}

// ─── Public Entry Point ───────────────────────────────────────────────────────
//
// Generates 24 sessions (12 per night × 2 nights) using the real scoring
// functions. Writes to HISTORY_KEY + ALLTIME_KEY. Does NOT touch STORAGE_KEY
// (the active game). Appends to any existing history/alltime data.

export async function seedSimData(
  players: Player[],
  stakePerTai: number,
): Promise<{ sessions: number; totalHands: number }> {
  // Night 1: Sun Apr 26 2026 · Night 2: Sun May 03 2026
  // 12 sessions per night, ~35 min apart starting at 7 PM
  const sessions: CompletedGame[] = [];

  for (let night = 0; night < 2; night++) {
    const base = new Date(night === 0 ? '2026-04-26T19:00:00' : '2026-05-03T19:00:00');
    for (let s = 0; s < 12; s++) {
      const sessionDate = new Date(base.getTime() + s * 35 * 60 * 1000);
      sessions.push(simulateSession(players, stakePerTai, sessionDate));
    }
  }

  // Build all-time totals from generated sessions
  const allTime: AllTimeTotals = {};
  for (const session of sessions) {
    for (const p of session.players) {
      const prev = allTime[p.id] ?? { name: p.name, total: 0, games: 0 };
      allTime[p.id] = {
        name: p.name,
        total: Math.round((prev.total + p.score) * 100) / 100,
        games: prev.games + 1,
      };
    }
  }

  // Most-recent session first (matches how the app prepends on New Game)
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([...sessions].reverse()));
  await AsyncStorage.setItem(ALLTIME_KEY, JSON.stringify(allTime));

  return { sessions: sessions.length, totalHands: sessions.reduce((s, g) => s + g.totalHands, 0) };
}
