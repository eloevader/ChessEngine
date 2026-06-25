import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from './GameState';

export interface Threat {
  from: Square;
  to: Square;
  /** 'w' = white is attacking this square, 'b' = black is attacking it. */
  attacker: 'w' | 'b';
}

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

/** Computes attack arrows for the current position.
 *  Only shows threats from the specified side to avoid cluttering the board. */
export function useThreats(
  fen: string,
  showThreats: boolean,
  attackerColor: 'w' | 'b',
): Threat[] {
  return useMemo(() => {
    if (!showThreats) return [];

    const game = new GameState(fen);
    // board() is 8x8 with board[0] = rank 8 (top of board in standard view)
    const board = (game as unknown as { chess: { board: () => Array<Array<{ type: string; color: 'w' | 'b' } | null>> } })
      .chess.board();

    // Pawn attack direction depends on color
    const pawnDir = attackerColor === 'w' ? 1 : -1;
    const pawnAttacks: [number, number][] = [[-1, pawnDir], [1, pawnDir]];

    const threats: Threat[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== attackerColor) continue;

        const fromSquare = squareAt(c, r);
        let dirs: [number, number][] = [];

        switch (piece.type) {
          case 'p':
            dirs = pawnAttacks;
            break;
          case 'n':
            dirs = KNIGHT_MOVES;
            break;
          case 'b':
            dirs = BISHOP_DIRS;
            break;
          case 'r':
            dirs = ROOK_DIRS;
            break;
          case 'q':
            dirs = [...BISHOP_DIRS, ...ROOK_DIRS];
            break;
          case 'k':
            dirs = KING_MOVES;
            break;
          default:
            continue;
        }

        const isSliding = SLIDING.has(piece.type);

        for (const [df, dr] of dirs) {
          if (!isSliding) {
            const tf = c + df;
            const tr = r + dr;
            if (!inBounds(tf, tr)) continue;
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: piece.color });
            continue;
          }
          // Sliding pieces: walk until blocked or off board
          let tf = c + df;
          let tr = r + dr;
          while (inBounds(tf, tr)) {
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: piece.color });
            if (board[tr][tf]) break; // blocked by any piece (own or enemy)
            tf += df;
            tr += dr;
          }
        }
      }
    }
    return threats;
  }, [fen, showThreats, attackerColor]);
}
