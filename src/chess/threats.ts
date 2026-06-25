import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from './GameState';

// ---------- Attack patterns ----------

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

// ---------- Public types ----------

/** Color buckets for arrows (chess.com style). */
export type ArrowColor = 'green' | 'red' | 'yellow' | 'blue';

/** A single arrow (or a single-circle highlight) on the board. */
export interface Arrow {
  from: Square;
  to: Square;
  color: ArrowColor;
  /** True when the arrow originates from the last-moved piece (auto-drawn threat). */
  auto?: boolean;
}

// ---------- Attack computation ----------

/** Returns the set of squares attacked by the piece currently sitting on `from`. */
function attacksFromSquare(fen: string, from: Square): Set<Square> {
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Array<Array<{ type: string; color: 'w' | 'b' } | null>> } })
    .chess.board();

  const { f, r } = squareToCoords(from);
  const row = 7 - r;
  const col = f;
  const piece = board[row]?.[col] ?? null;
  if (!piece) return new Set();

  const pawnDir = piece.color === 'w' ? 1 : -1;
  const pawnAttacks: [number, number][] = [[-1, pawnDir], [1, pawnDir]];

  let dirs: [number, number][] = [];
  switch (piece.type) {
    case 'p': dirs = pawnAttacks; break;
    case 'n': dirs = KNIGHT_MOVES; break;
    case 'b': dirs = BISHOP_DIRS; break;
    case 'r': dirs = ROOK_DIRS; break;
    case 'q': dirs = [...BISHOP_DIRS, ...ROOK_DIRS]; break;
    case 'k': dirs = KING_MOVES; break;
    default: return new Set();
  }

  const isSliding = SLIDING.has(piece.type);
  const squares = new Set<Square>();

  for (const [df, dr] of dirs) {
    if (!isSliding) {
      const tf = col + df;
      const tr = row + dr;
      if (!inBounds(tf, tr)) continue;
      squares.add(squareAt(tf, tr));
      continue;
    }
    let tf = col + df;
    let tr = row + dr;
    while (inBounds(tf, tr)) {
      squares.add(squareAt(tf, tr));
      if (board[tr][tf]) break;
      tf += df;
      tr += dr;
    }
  }

  return squares;
}

// ---------- Hooks ----------

/** Returns the set of squares attacked by the piece that just moved.
 *  Used during analysis / review to draw threat arrows in red. */
export function useLastMoveThreatSquares(
  fen: string,
  enabled: boolean,
  lastMove: { from: Square; to: Square } | null,
): Set<Square> {
  return useMemo(() => {
    if (!enabled || !lastMove) return new Set();
    return attacksFromSquare(fen, lastMove.to);
  }, [fen, enabled, lastMove]);
}

// ---------- Color presets (RGB so we can vary opacity) ----------

export const ARROW_COLORS: Record<ArrowColor, string> = {
  green: '157, 196, 85',   // chess.com green
  red: '222, 80, 80',      // chess.com red
  yellow: '234, 204, 65',  // chess.com yellow
  blue: '85, 152, 222',    // chess.com blue
};
