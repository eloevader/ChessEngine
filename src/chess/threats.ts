import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from '../chess/GameState';

export interface Threat {
  from: Square;
  to: Square;
  /** 'w' = white is attacking this square, 'b' = black is attacking it. */
  attacker: 'w' | 'b';
}

const PIECE_ATTACKS: Record<string, [number, number][]> = {
  p: [
    [1, 1],
    [-1, 1],
  ],
  n: [
    [2, 1], [1, 2], [-1, 2], [-2, 1],
    [-2, -1], [-1, -2], [1, -2], [2, -1],
  ],
  b: [
    [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
    [-1, 1], [-2, 2], [-3, 3], [-4, 4], [-5, 5], [-6, 6], [-7, 7],
    [1, -1], [2, -2], [3, -3], [4, -4], [5, -5], [6, -6], [7, -7],
    [-1, -1], [-2, -2], [-3, -3], [-4, -4], [-5, -5], [-6, -6], [-7, -7],
  ],
  r: [
    [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0],
    [-1, 0], [-2, 0], [-3, 0], [-4, 0], [-5, 0], [-6, 0], [-7, 0],
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7],
    [0, -1], [0, -2], [0, -3], [0, -4], [0, -5], [0, -6], [0, -7],
  ],
  q: [], // filled below
  k: [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ],
};
PIECE_ATTACKS.q = [...PIECE_ATTACKS.b, ...PIECE_ATTACKS.r];

const SLIDING = new Set(['b', 'r', 'q']);

function inBounds(f: number, r: number): boolean {
  return f >= 0 && f <= 7 && r >= 0 && r <= 7;
}

function squareAt(fileIdx: number, rankIdx: number): Square {
  return (String.fromCharCode(97 + fileIdx) + (rankIdx + 1)) as Square;
}

/** Computes attack arrows for the current position.
 *  Each arrow goes from an attacking piece to the square it threatens.
 *  - `attackers` are restricted to the piece color passed in (so we draw only
 *    white threats or only black threats at a time). */
export function useThreats(fen: string, showThreats: boolean): Threat[] {
  return useMemo(() => {
    if (!showThreats) return [];
    const game = new GameState(fen);
    const board = (game as any).chess.board() as Array<Array<{ type: string; color: 'w' | 'b' } | null>>;
    // board is 8x8, board[0] is rank 8, board[7] is rank 1
    const threats: Threat[] = [];

    // For each piece on the board, compute the squares it attacks
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        const type = piece.type;
        const color = piece.color;
        const fromFile = c;
        const fromRank = r;
        const fromSquare = squareAt(fromFile, fromRank);

        const moves = PIECE_ATTACKS[type] ?? [];
        for (const [df, dr] of moves) {
          if (!SLIDING.has(type)) {
            const tf = fromFile + df;
            const tr = fromRank + dr;
            if (!inBounds(tf, tr)) continue;
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: color });
            continue;
          }
          // Sliding: walk in the direction until out of bounds or blocked
          let tf = fromFile + df;
          let tr = fromRank + dr;
          while (inBounds(tf, tr)) {
            const target = board[tr][tf];
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: color });
            if (target) break; // blocked
            tf += df;
            tr += dr;
          }
        }
      }
    }
    return threats;
  }, [fen, showThreats]);
}
