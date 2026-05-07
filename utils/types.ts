// ─── Tile & Game Basics ───────────────────────────────────────────────────────

export type Wind = 'east' | 'south' | 'west' | 'north';
export type DrawMethod = 'self' | 'discard';

// ─── Players ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;       // 'p1' | 'p2' | 'p3' | 'p4'
  name: string;     // e.g. "Anthony"
  seatWind: Wind;
  score: number;    // running total in dollars/cents
}

// ─── Scoring Patterns (from Stephen's sheet) ─────────────────────────────────

export interface Pattern {
  id: string;           // unique key, e.g. 'zhuang_jia'
  chinese: string;      // e.g. '莊家'
  pinyin: string;       // e.g. 'zhuang1 jia1'
  english: string;      // e.g. 'Dealer bonus'
  tai: number;          // points value per occurrence
  category: PatternCategory;
  countable?: boolean;  // true = renders as a counter (tai × count), not a toggle
  notes?: string;       // any special rules
}

export type PatternCategory =
  | 'situational'   // dealer, self-draw, last tile, etc.
  | 'hand_quality'  // concealed hand, single winning tile
  | 'flowers'       // flower/honor tiles
  | 'pengs_kongs'   // peng/kong based patterns
  | 'hand_shape'    // all-pengs, ping hu, etc.
  | 'special';      // limit hands, 7-flowers, 8-flowers, etc.

// ─── A Single Scored Hand ─────────────────────────────────────────────────────

export interface ScoredHand {
  winnerId: string;
  drawMethod: DrawMethod;
  discarderId?: string;       // only set if drawMethod === 'discard'
  selectedPatternIds: string[];
  flowerCount: number;        // 0–8 individual flower tiles
  totalTai: number;
  payments: Payment[];        // who pays what to winner
  dealerPlayerId: string;     // who was dealer when this hand was played
}

export interface Payment {
  fromPlayerId: string;
  toPlayerId: string;         // always the winner
  tai: number;
  amount: number;             // tai × stakePerTai
}

// ─── Full Game State ──────────────────────────────────────────────────────────

export interface GameState {
  prevalingWind: Wind;
  stakePerTai: number;        // dollars per tai, e.g. 0.25
  players: Player[];
  dealerPlayerId: string;     // which player is currently dealer (East)
  handNumber: number;         // how many hands have been played
  rounds: ScoredHand[];
}

// ─── Completed Game (saved to history) ───────────────────────────────────────

export interface CompletedGame {
  id: string;
  completedAt: string;   // ISO date string
  players: Player[];     // with final scores
  totalHands: number;
  stakePerTai: number;
}
