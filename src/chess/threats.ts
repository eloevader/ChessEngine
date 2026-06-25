import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from './GameState';

// Attack patterns: [fileDelta, rankDelta] where rankDelta is +1 for white
// (moving up the board) and -1 for black (moving down the board).
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

/** Returns the set of squares attacked by the piece currently sitting on `from`. */
function attacksFromSquare(fen: string, from: Square): Set<Square> {
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Array<Array<{ type: string; color: 'w' | 'b' } | null>> } })
    .chess.board();

  const { f, r } = squareToCoords(from);
  // board[0] is rank 8 (top), so convert our rank (1..8) to board index.
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
      if (board[tr][tf]) break; // blocked by any piece (own or enemy)
      tf += df;
      tr += dr;
    }
  }

  return squares;
}

/** Returns the set of squares attacked by the piece that just moved.
 *  Used during post-game review to highlight "if the opponent doesn't
 *  move, I could take this" in red.
 *
 *  - `enabled` should only be true in review mode.
 *  - `lastMove` is the most recent move (from -> to).
 *  - Returns an empty set when disabled or when no move has been played.
 */
export function useLastMoveThreats(
  fen: string,
  enabled: boolean,
  lastMove: { from: Square; to: Square } | null,
): Set<Square> {
  return useMemo(() => {
    if (!enabled || !lastMove) return new Set();
    // Use the destination square: that's where the piece now sits.
    return attacksFromSquare(fen, lastMove.to);
  }, [fen, enabled, lastMove]);
}
