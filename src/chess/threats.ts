import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from './GameState';

// ---------- Attack patterns (pure geometry) ----------

const KNIGHT_MOVES: [number, number][] = [
  [2, 1], [1, 2], [-1, 2], [-2, 1],
  [-2, -1], [-1, -2], [1, -2], [2, -1],
];

const BISHOP_DIRS: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

const ROOK_DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const KING_MOVES: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const SLIDING = new Set(['b', 'r', 'q']);

function inBounds(f: number, r: number): boolean {
  return f >= 0 && f <= 7 && r >= 0 && r <= 7;
}

function squareAt(fileIdx: number, rankIdx: number): Square {
  return (String.fromCharCode(97 + fileIdx) + (rankIdx + 1)) as Square;
}

function squareToCoords(s: Square): { f: number; r: number } {
  return { f: s.charCodeAt(0) - 97, r: parseInt(s[1], 10) - 1 };
}

export type Piece = { type: string; color: 'w' | 'b' };
type Board = (Piece | null)[][];

// ---------- Public types ----------

/** Arrow colors. The tracker only ever uses 'white' (for White's attacks)
 *  or 'black' (for Black's attacks) — but the type keeps the full
 *  palette for the user-drawn arrow tools. */
export type ArrowColor = 'white' | 'black' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';

export interface Arrow {
  from: Square;
  to: Square;
  color: ArrowColor;
  weight?: 'thin' | 'normal' | 'thick';
  dashed?: boolean;
  /** True for arrows auto-drawn by the live attack tracker. */
  auto?: boolean;
}

/** "White's [piece] on [square] attacks Black's [piece] on [square]." */
export interface AttackDescription {
  attackerColor: 'w' | 'b';
  attackerSquare: Square;
  attackerType: string;
  targetSquare: Square;
  targetType: string;
}

export interface LiveAttackResult {
  arrows: Arrow[];
  descriptions: AttackDescription[];
}

// ---------- Color presets ----------

export const ARROW_COLORS: Record<ArrowColor, string> = {
  white: '255, 255, 255',
  black: '40, 40, 40',
  green: '157, 196, 85',
  red: '222, 80, 80',
  yellow: '234, 204, 65',
  blue: '85, 152, 222',
  purple: '168, 85, 222',
};

// ---------- Pure geometry: every square a piece on (col, row) attacks ----------

/** Returns the squares containing an enemy piece that the piece on
 *  `from` physically attacks. Sliding pieces stop at the first piece
 *  in any direction. Pins / checks / legal-move validity are ignored. */
function enemySquaresAttackedBy(board: Board, from: Square): Square[] {
  const { f, r } = squareToCoords(from);
  const col = f;
  const row = 7 - r;
  const piece = board[row]?.[col] ?? null;
  if (!piece) return [];

  // chess.js's board() is board[0] = rank 8, board[7] = rank 1.
  // So moving toward higher rank means DECREASING row index.
  // White pawns move "up" the board (rank increases → row decreases).
  const pawnDir = piece.color === 'w' ? -1 : 1;
  const pawnAttacks: [number, number][] = [[-1, pawnDir], [1, pawnDir]];

  let dirs: [number, number][] = [];
  switch (piece.type) {
    case 'p': dirs = pawnAttacks; break;
    case 'n': dirs = KNIGHT_MOVES; break;
    case 'b': dirs = BISHOP_DIRS; break;
    case 'r': dirs = ROOK_DIRS; break;
    case 'q': dirs = [...BISHOP_DIRS, ...ROOK_DIRS]; break;
    case 'k': dirs = KING_MOVES; break;
    default: return [];
  }

  const isSliding = SLIDING.has(piece.type);
  const out: Square[] = [];

  for (const [df, dr] of dirs) {
    if (!isSliding) {
      const tf = col + df;
      const tr = row + dr;
      if (!inBounds(tf, tr)) continue;
      const target = board[tr]?.[tf] ?? null;
      if (target && target.color !== piece.color) {
        // squareAt expects (fileIdx, rankIdx 1-8); tr is a board row
        // index (0 = rank 8) so convert with 7 - tr.
        out.push(squareAt(tf, 7 - tr));
      }
      continue;
    }
    let tf = col + df;
    let tr = row + dr;
    while (inBounds(tf, tr)) {
      const target = board[tr]?.[tf] ?? null;
      if (target) {
        if (target.color !== piece.color) out.push(squareAt(tf, 7 - tr));
        break; // sliding piece stops at the first piece in any direction
      }
      tf += df;
      tr += dr;
    }
  }

  return out;
}

// ---------- Threat compute helpers ----------

interface ComputeContext {
  board: Board;
  /** Filter: which pieces to consider. If undefined, all pieces. */
  onlyColor?: 'w' | 'b';
  /** Optional: which piece (by square) is the only attacker. Used for
   *  the 'lastMove' scope. */
  onlySquare?: Square;
}

function buildThreatsFrom(
  ctx: ComputeContext,
  _movedSquare: Square | null,
): LiveAttackResult {
  const { board, onlyColor, onlySquare } = ctx;
  const descriptions: AttackDescription[] = [];
  const seen = new Set<string>(); // dedupe "attacker -> target" pairs

  // chess.js's board() is board[0] = rank 8, board[7] = rank 1.
  // We need to convert (row, col) to a square name: rank = 8 - row.
  for (let row = 0; row < 8; row++) {
    for (let c = 0; c < 8; c++) {
      const p = board[row]?.[c] ?? null;
      if (!p) continue;
      if (onlyColor && p.color !== onlyColor) continue;
      const fromSq = squareAt(c, 7 - row);
      if (onlySquare && fromSq !== onlySquare) continue;
      const enemySqs = enemySquaresAttackedBy(board, fromSq);
      for (const t of enemySqs) {
        const key = `${fromSq}->${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tc = squareToCoords(t);
        const trow = 7 - tc.r;
        const tcol = tc.f;
        const tgt = board[trow]?.[tcol] ?? null;
        if (!tgt) continue;
        descriptions.push({
          attackerColor: p.color,
          attackerSquare: fromSq,
          attackerType: p.type,
          targetSquare: t,
          targetType: tgt.type,
        });
      }
    }
  }

  // In 'lastMove' scope, every attack MUST originate from the moved
  // square. Pin the expected attacker color to whatever is actually on
  // that square right now, then drop any description whose attacker
  // square OR color disagrees — a final defense-in-depth guard so a
  // single move can never produce arrows of the wrong color or from
  // a different piece.
  const expectedAttackerColor: 'w' | 'b' | null = (() => {
    if (onlySquare) {
      const tc = squareToCoords(onlySquare);
      const trow = 7 - tc.r;
      const tcol = tc.f;
      const p = board[trow]?.[tcol] ?? null;
      if (p) return p.color;
    }
    if (onlyColor) return onlyColor;
    return null;
  })();
  const filteredDescriptions = descriptions.filter((d) => {
    if (onlySquare && d.attackerSquare !== onlySquare) return false;
    if (
      onlySquare &&
      expectedAttackerColor &&
      d.attackerColor !== expectedAttackerColor
    ) {
      return false;
    }
    return true;
  });
  const arrows: Arrow[] = filteredDescriptions.map((d) => ({
    from: d.attackerSquare,
    to: d.targetSquare,
    // Threat arrows are always red for both sides — the user-facing rule
    // is simply "this piece is under attack by the piece that just
    // moved", and a single uniform color is easier to read at a glance
    // than side-coded colors.
    color: 'red',
    auto: true,
  }));

  // Suppress unused-var warning on expectedAttackerColor (kept for the
  // guard above; future scope logic may want it).
  void expectedAttackerColor;

  return { arrows, descriptions: filteredDescriptions };
}

// ---------- Live attack tracker (the ONLY rule) ----------

/** After a move, compute the arrows from the piece that just moved to
 *  each enemy piece it attacks.
 *
 *  Per the spec:
 *   1. Only the piece on `movedSquare` is considered.
 *   2. Only squares containing an ENEMY piece produce an arrow.
 *   3. Empty squares and friendly pieces are ignored.
 *   4. We never check whether the enemy attacks back, whether the
 *      target is defended, whether anyone is in check, etc. — pure
 *      geometry.
 *   5. White's attacks are blue, Black's attacks are red.
 *   6. Multiple targets: one straight arrow per target. */
export function computeLiveAttacks(
  fen: string,
  movedSquare: Square | null,
): LiveAttackResult {
  if (!movedSquare) return { arrows: [], descriptions: [] };
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Board } })
    .chess.board();
  return buildThreatsFrom({ board, onlySquare: movedSquare }, movedSquare);
}

/** Compute every attack by every piece on the board against enemy
 *  pieces. White's arrows are blue, Black's are red. Empty squares and
 *  same-color pieces are ignored. Sliding pieces stop at the first
 *  piece in any direction. */
/** Compute every direct attack by pieces of the given `attackerColor`
 *  on enemy pieces. White's arrows are blue, Black's are red. Empty
 *  squares and same-color pieces are ignored. Sliding pieces stop at
 *  the first piece in any direction. */
export function computeBoardAttacks(
  fen: string,
  attackerColor: 'w' | 'b',
): LiveAttackResult {
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Board } })
    .chess.board();
  return buildThreatsFrom({ board, onlyColor: attackerColor }, null);
}

// ---------- Hook ----------

export function useLiveAttacks(
  fen: string,
  enabled: boolean,
  movedSquare: Square | null,
  scope: 'lastMove' | 'board' = 'lastMove',
  attackerColor: 'w' | 'b' | null = null,
): LiveAttackResult {
  return useMemo(() => {
    if (!enabled) return { arrows: [], descriptions: [] };
    if (scope === 'board') {
      if (!attackerColor) return { arrows: [], descriptions: [] };
      return computeBoardAttacks(fen, attackerColor);
    }
    if (!movedSquare) return { arrows: [], descriptions: [] };
    return computeLiveAttacks(fen, movedSquare);
  }, [fen, enabled, movedSquare, scope, attackerColor]);
}
