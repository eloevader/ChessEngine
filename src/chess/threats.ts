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
 *  Restricts to the side that's about to move so the board isn't flooded
 *  with hundreds of arrows. */
export function useThreats(
  fen: string,
  showThreats: boolean,
  attackerFilter: 'w' | 'b' = 'b',
): Threat[] {
  return useMemo(() => {
    if (!showThreats) return [];
    const game = new GameState(fen);
    const board = (game as any).chess.board() as Array<Array<{ type: string; color: 'w' | 'b' } | null>>;
    const threats: Threat[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== attackerFilter) continue;
        const fromSquare = squareAt(c, r);

        const moves = PIECE_ATTACKS[piece.type] ?? [];
        for (const [df, dr] of moves) {
          if (!SLIDING.has(piece.type)) {
            const tf = c + df;
            const tr = r + dr;
            if (!inBounds(tf, tr)) continue;
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: piece.color });
            continue;
          }
          let tf = c + df;
          let tr = r + dr;
          while (inBounds(tf, tr)) {
            threats.push({ from: fromSquare, to: squareAt(tf, tr), attacker: piece.color });
            if (board[tr][tf]) break;
            tf += df;
            tr += dr;
          }
        }
      }
    }
    return threats;
  }, [fen, showThreats, attackerFilter]);
}
