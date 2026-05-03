import { Pattern, PatternCategory, ScoredHand, Player, GameState, Payment } from './types';

// ─── All Patterns from Steven's Sheet ────────────────────────────────────────
//
// Grouped by category. The scoring screen will display these grouped.
// Patterns marked tbd: true are flagged as unclear — we'll confirm with Stephen.

export const PATTERNS: Pattern[] = [

  // ── Situational (auto-applied or quick toggles) ────────────────────────────
  {
    id: 'zhuang_jia',
    chinese: '莊家', pinyin: 'zhuang1 jia1',
    english: 'Dealer bonus',
    tai: 1, category: 'situational',
    notes: 'Applied automatically when winner is dealer. Does NOT apply to 小胡.',
  },
  {
    id: 'zi_mo',
    chinese: '自摸', pinyin: 'zi4 mo1',
    english: 'Self draw',
    tai: 1, category: 'situational',
    notes: 'Winner drew their own winning tile.',
  },
  {
    id: 'hai_di',
    chinese: '海底撈月', pinyin: 'hai3 di3 lao1 yue4',
    english: 'Last tile from wall',
    tai: 1, category: 'situational',
    notes: 'Won on the very last drawable tile.',
  },
  {
    id: 'qiang_gang',
    chinese: '搶槓', pinyin: 'qiang3 gang4',
    english: 'Win off opponent\'s kong attempt',
    tai: 1, category: 'situational',
    notes: 'Opponent tried to declare a kong and you win off that tile.',
  },
  {
    id: 'gang_shang_hua',
    chinese: '槓上開花', pinyin: 'gang4 shang4 kai1 hua1',
    english: 'Win off replacement tile',
    tai: 1, category: 'situational',
    notes: 'Drew a replacement tile after a kong (or flower) and won with it.',
  },

  // ── Hand Quality ────────────────────────────────────────────────────────────
  {
    id: 'men_qing',
    chinese: '門清', pinyin: 'men2 qing1',
    english: 'Concealed hand',
    tai: 1, category: 'hand_quality',
    notes: 'No exposed chows or pengs. Kongs are OK.',
  },
  {
    id: 'du_ting',
    chinese: '獨聽', pinyin: 'du2 ting4',
    english: 'Single winning tile',
    tai: 1, category: 'hand_quality',
    notes: 'Only one specific tile could complete the hand.',
  },
  {
    id: 'yi_mo_san',
    chinese: '一摸三', pinyin: 'yi1 mo1 san1',
    english: 'Concealed + no-claim + self draw bonus',
    tai: 3, category: 'hand_quality',
    notes: 'Bonus for having 門清 + 不求 + 自摸 together. Stacks ON TOP of those individual tai.',
  },
  {
    id: 'ban_qiu',
    chinese: '半求', pinyin: 'ban4 qiu2',
    english: 'Half claimed (includes self draw + single tile)',
    tai: 5, category: 'hand_quality',
  },
  {
    id: 'quan_qiu_ren',
    chinese: '全求人', pinyin: 'quan2 qiu2 ren2',
    english: 'All exposed (fully claimed hand)',
    tai: 15, category: 'hand_quality',
    notes: 'All sets are exposed (claimed from discards). Includes single winning tile.',
  },

  // ── Flowers & Honors ────────────────────────────────────────────────────────
  {
    id: 'wu_hua',
    chinese: '無花', pinyin: 'wu2 hua1',
    english: 'No flowers',
    tai: 1, category: 'flowers',
    notes: 'Do not combine with 無字 individually — use 無花無字 (3 tai) instead.',
  },
  {
    id: 'wu_zi',
    chinese: '無字', pinyin: 'wu2 zi4',
    english: 'No honor tiles (words)',
    tai: 1, category: 'flowers',
    notes: 'Do not combine with 無花 individually — use 無花無字 (3 tai) instead.',
  },
  {
    id: 'wu_hua_wu_zi',
    chinese: '無花無字', pinyin: 'wu2 hua1 wu2 zi4',
    english: 'No flowers AND no honors',
    tai: 3, category: 'flowers',
    notes: 'Replaces 無花 + 無字. Use this instead of selecting them separately.',
  },
  {
    id: 'mei_ge_hua',
    chinese: '每個花', pinyin: 'mei3 ge4 hua1',
    english: 'Each flower tile',
    tai: 1, category: 'flowers',
    notes: 'Tap + / – to set how many flower tiles you have (0–7).',
  },
  {
    id: 'mei_ge_zi',
    chinese: '每個字', pinyin: 'mei3 ge4 zi4',
    english: 'Each honor tile (wind/dragon)',
    tai: 1, category: 'flowers',
    notes: 'TBD — confirm with Stephen exactly what qualifies.',
  },
  {
    id: 'qi_qiang_yi',
    chinese: '七搶一', pinyin: 'qi1 qiang3 yi1',
    english: '7 flowers (8th flower holder pays)',
    tai: 20, category: 'flowers',
    notes: 'You have 7 flowers. Only the player holding the 8th flower pays you.',
  },
  {
    id: 'ba_duo_hua',
    chinese: '八朵花', pinyin: 'ba1 duo3 hua3',
    english: '8 flowers — hand ends immediately!',
    tai: 40, category: 'flowers',
    notes: 'Hand ends immediately when this is declared.',
  },

  // ── Pengs & Kongs ───────────────────────────────────────────────────────────
  {
    id: 'liang_an_kan',
    chinese: '兩暗崁', pinyin: 'liang3 an2 kan3',
    english: 'Two concealed pengs',
    tai: 1, category: 'pengs_kongs',
    notes: 'TBD — confirm with Stephen if this is exactly 2, or 2+.',
  },
  {
    id: 'ming_gang',
    chinese: '明槓', pinyin: 'ming2 gang4',
    english: 'Each exposed kong',
    tai: 1, category: 'pengs_kongs',
    notes: '1 tai per exposed kong declared.',
  },
  {
    id: 'an_gang',
    chinese: '每個暗槓', pinyin: 'mei3 ge4 an4 gang4',
    english: 'Each concealed kong',
    tai: 2, category: 'pengs_kongs',
    notes: '2 tai per concealed kong declared.',
  },
  {
    id: 'san_an_kan',
    chinese: '三暗崁', pinyin: 'san1 an4 kan3',
    english: 'Three concealed pengs',
    tai: 5, category: 'pengs_kongs',
  },
  {
    id: 'si_an_kan',
    chinese: '四暗崁', pinyin: 'si4 an4 kan3',
    english: 'Four concealed pengs',
    tai: 15, category: 'pengs_kongs',
  },
  {
    id: 'si_gang',
    chinese: '四槓', pinyin: 'si4 gang4',
    english: 'Four kongs',
    tai: 30, category: 'pengs_kongs',
    notes: 'Includes four concealed kongs.',
  },
  {
    id: 'wu_an_kan',
    chinese: '五暗崁', pinyin: 'wu3 an4 kan3',
    english: 'Five concealed pengs',
    tai: 40, category: 'pengs_kongs',
    notes: 'Includes 對對 (all pengs).',
  },
  {
    id: 'wu_gang',
    chinese: '五槓', pinyin: 'wu3 gang4',
    english: 'Five kongs',
    tai: 50, category: 'pengs_kongs',
    notes: 'Includes five concealed kongs and 對對.',
  },

  // ── Hand Shape ──────────────────────────────────────────────────────────────
  {
    id: 'xiao_ping_hu',
    chinese: '小平胡', pinyin: 'xiao3 ping2 hu2',
    english: 'Small ping hu',
    tai: 3, category: 'hand_shape',
    notes: 'Add flower tai separately on top.',
  },
  {
    id: 'da_ping_hu',
    chinese: '大平胡', pinyin: 'da4 ping2 hu2',
    english: 'Big ping hu',
    tai: 10, category: 'hand_shape',
    notes: 'Includes 無花無字 — do not count those separately.',
  },
  {
    id: 'dui_dui_hu',
    chinese: '對對胡', pinyin: 'dui4 dui4 hu2',
    english: 'All pengs',
    tai: 10, category: 'hand_shape',
  },
  {
    id: 'cou_yi_se',
    chinese: '湊一色', pinyin: 'cou4 yi2 se4',
    english: 'All one suit or honors',
    tai: 10, category: 'hand_shape',
    notes: 'One suit mixed with winds/dragons is OK.',
  },
  {
    id: 'san_xiang_peng',
    chinese: '三相碰', pinyin: 'san1 xiang1 peng4',
    english: 'Same-number pengs in all 3 suits',
    tai: 5, category: 'hand_shape',
    notes: 'e.g. three 5s in characters, bamboo, and dots.',
  },
  {
    id: 'san_lian_peng',
    chinese: '三連碰', pinyin: 'san1 lian2 peng4',
    english: 'Three consecutive pengs, same suit',
    tai: 5, category: 'hand_shape',
    notes: 'e.g. peng of 3, 4, 5 all in bamboo.',
  },
  {
    id: 'si_lian_peng',
    chinese: '四連碰', pinyin: 'si4 lian2 peng4',
    english: 'Four consecutive pengs, same suit',
    tai: 20, category: 'hand_shape',
  },
  {
    id: 'wu_lian_peng',
    chinese: '五連碰', pinyin: 'wu3 lian2 peng4',
    english: 'Five consecutive pengs, same suit',
    tai: 50, category: 'hand_shape',
  },
  {
    id: 'qing_yi_se',
    chinese: '清一色', pinyin: 'qing1 yi2 se4',
    english: 'Pure one suit (no honors)',
    tai: 50, category: 'hand_shape',
  },

  // ── Special / Limit Hands ───────────────────────────────────────────────────
  {
    id: 'xiao_hu',
    chinese: '小胡', pinyin: 'xiao3 hu2',
    english: 'Small win',
    tai: 5, category: 'special',
    notes: 'SPECIAL RULE: total hand is capped at 1 tai. Dealer bonus does NOT apply.',
  },
  {
    id: 'san_feng_peng',
    chinese: '三風碰', pinyin: 'san1 feng1 peng4',
    english: 'Three wind pengs',
    tai: 15, category: 'special',
  },
  {
    id: 'quan_zi_peng',
    chinese: '全字碰', pinyin: 'quan1 zi4 peng4',
    english: 'All honor pengs',
    tai: 20, category: 'special',
  },
  {
    id: 'xiao_san_yuan',
    chinese: '小三元', pinyin: 'xiao3 san1 yuan2',
    english: 'Two dragon pengs + pair of third dragon',
    tai: 20, category: 'special',
  },
  {
    id: 'da_san_yuan',
    chinese: '大三元', pinyin: 'da4 san1 yuan2',
    english: 'All three dragon pengs',
    tai: 40, category: 'special',
  },
  {
    id: 'xiao_si_xi',
    chinese: '小四喜', pinyin: 'xiao3 si4 xi3',
    english: 'Three wind pengs + pair of fourth wind',
    tai: 40, category: 'special',
  },
  {
    id: 'da_si_xi',
    chinese: '大四喜', pinyin: 'da4 si4 xi3',
    english: 'All four wind pengs',
    tai: 50, category: 'special',
  },
  {
    id: 'ba_dui_ban',
    chinese: '八對半', pinyin: 'ba1 dui4 ban4',
    english: 'Eight pairs',
    tai: 20, category: 'special',
    notes: 'TBD — confirm exact rules with Stephen.',
  },
];

// ─── Helper: look up a pattern by id ─────────────────────────────────────────

export function getPattern(id: string): Pattern | undefined {
  return PATTERNS.find(p => p.id === id);
}

export function getPatternsByCategory(category: PatternCategory): Pattern[] {
  return PATTERNS.filter(p => p.category === category);
}

// ─── Core Scoring Function ────────────────────────────────────────────────────
//
// Given:
//   - selectedPatternIds: which patterns the user toggled on
//   - flowerCount: number of individual flower tiles (each = 1 tai)
//   - isDealer: whether the winner is the current dealer
//   - isSelfDraw: whether the winner drew their own winning tile
//
// Returns the total tai for the hand.

export function calculateTai(
  selectedPatternIds: string[],
  flowerCount: number,
  isDealer: boolean,
  isSelfDraw: boolean,
): number {

  // Special case: 小胡 = hand is capped at 1 tai, no dealer bonus
  if (selectedPatternIds.includes('xiao_hu')) {
    return 1;
  }

  // Special case: 八朵花 = 40 tai flat, hand ends immediately
  if (selectedPatternIds.includes('ba_duo_hua')) {
    return 40;
  }

  let total = 0;

  // Add tai for each selected pattern (excluding flower count patterns)
  for (const id of selectedPatternIds) {
    const pattern = getPattern(id);
    if (!pattern) continue;

    // 每個花 is handled separately via flowerCount below
    if (id === 'mei_ge_hua') continue;

    total += pattern.tai;
  }

  // Add flower tiles (1 tai each)
  total += flowerCount;

  // Dealer bonus (automatically applied if winner is dealer)
  if (isDealer) {
    total += 1; // 莊家 = 1 tai
  }

  // Self draw (1 tai) — only add if not already in selectedPatternIds
  // (user selects 自摸 manually, but we also use isSelfDraw to drive payment logic)
  // Note: 自摸 is in the pattern list, so the user picks it — we don't double count here.

  return total;
}

// ─── Payment Calculation ─────────────────────────────────────────────────────
//
// Taiwanese rules:
//   Self draw  → all 3 opponents pay the winner
//   Discard    → only the discarder pays (other two pay nothing)

export function calculatePayments(
  hand: ScoredHand,
  players: Player[],
  stakePerTai: number,
): Payment[] {
  const payments: Payment[] = [];
  const winner = players.find(p => p.id === hand.winnerId);
  if (!winner) return payments;

  const amount = hand.totalTai * stakePerTai;
  const opponents = players.filter(p => p.id !== hand.winnerId);

  if (hand.drawMethod === 'self') {
    // Everyone pays
    for (const opponent of opponents) {
      payments.push({
        fromPlayerId: opponent.id,
        toPlayerId: winner.id,
        tai: hand.totalTai,
        amount,
      });
    }
  } else {
    // Only the discarder pays
    const discarder = players.find(p => p.id === hand.discarderId);
    if (discarder) {
      payments.push({
        fromPlayerId: discarder.id,
        toPlayerId: winner.id,
        tai: hand.totalTai,
        amount,
      });
    }
  }

  return payments;
}

// ─── Dealer Rotation ──────────────────────────────────────────────────────────
//
// Returns the next dealer's player ID.
// If the winner was the dealer → dealer stays (same ID returned).
// If a non-dealer won → rotate to the next player in seating order.

export function getNextDealerPlayerId(
  players: Player[],
  currentDealerPlayerId: string,
  winnerPlayerId: string,
): string {
  if (winnerPlayerId === currentDealerPlayerId) {
    return currentDealerPlayerId; // dealer won — stays
  }
  const currentIndex = players.findIndex(p => p.id === currentDealerPlayerId);
  const nextIndex = (currentIndex - 1 + players.length) % players.length;
  return players[nextIndex].id;
}
