import { useMemo } from 'react';
import type { Square } from '../chess/types';
import { GameState } from './GameState';

// ---------- Attack patterns (geometry only, no check/pin awareness) ----------

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

/** The two move-time arrow colors. */
export type ArrowColor = 'white' | 'black' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';

/** A single arrow. `from` and `to` are square names. `attackerColor`
 *  indicates which side drew the arrow (used for the "vice-versa"
 *  coloring rule: White's attack on Black is blue, Black's attack on
 *  White is red). */
export interface Arrow {
  from: Square;
  to: Square;
  color: ArrowColor;
  weight?: 'thin' | 'normal' | 'thick';
  dashed?: boolean;
  /** True for arrows auto-drawn by the live attack tracker. */
  auto?: boolean;
  /** For mutual attacks, side A or B of the offset pair. */
  pair?: 'A' | 'B';
  /** Index into a list of "target descriptions" for the UI panel. */
  descIndex?: number;
}

// ---------- Color presets (RGB so we can vary opacity) ----------

export const ARROW_COLORS: Record<ArrowColor, string> = {
  white: '255, 255, 255',
  black: '40, 40, 40',
  green: '157, 196, 85',
  red: '222, 80, 80',
  yellow: '234, 204, 65',
  blue: '85, 152, 222',
  purple: '168, 85, 222',
};

/** "White's [piece] on [square] attacks Black's [piece] on [square]." */
export interface AttackDescription {
  /** Whose attack is this. */
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

// ---------- Geometry: every square a piece on (col, row) attacks ----------

/** Returns the set of squares containing an enemy piece that the piece
 *  on `from` physically attacks. Sliding pieces stop at the first piece
 *  in any direction. Pins / checks / legal-move validity are ignored. */
function enemySquaresAttackedBy(
  board: Board,
  from: Square,
): Square[] {
  const { f, r } = squareToCoords(from);
  const col = f;
  const row = 7 - r;
  const piece = board[row]?.[col] ?? null;
  if (!piece) return [];

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
        out.push(squareAt(tf, tr));
      }
      continue;
    }
    let tf = col + df;
    let tr = row + dr;
    while (inBounds(tf, tr)) {
      const target = board[tr]?.[tf] ?? null;
      if (target) {
        if (target.color !== piece.color) out.push(squareAt(tf, tr));
        break; // sliding piece stops at the first piece in any direction
      }
      tf += df;
      tr += dr;
    }
  }

  return out;
}

// ---------- Live attack tracker ----------

/** Compute the "live attack" arrows for the piece that just moved.
 *
 *  Rules (per the spec):
 *   1. Only the moved piece is considered. Other pieces' attacks are
 *      ignored.
 *   2. Only squares containing an enemy piece produce arrows. Empty
 *      squares are ignored.
 *   3. White attacking Black → blue. Black attacking White → red.
 *   4. If a target also attacks the moved piece back, draw two
 *      slightly-curved arrows (offset ±15°). The arrow from White to
 *      Black curves one way, the arrow from Black to White curves the
 *      other. */
export function computeLiveAttacks(
  fen: string,
  movedSquare: Square | null,
): LiveAttackResult {
  if (!movedSquare) return { arrows: [], descriptions: [] };
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Board } })
    .chess.board();

  // The piece on `movedSquare` is the active attacker.
  const { f, r } = squareToCoords(movedSquare);
  const row = 7 - r;
  const col = f;
  const attacker = board[row]?.[col] ?? null;
  if (!attacker) return { arrows: [], descriptions: [] };

  // Squares (containing an enemy piece) the active attacker hits.
  const enemySqs = enemySquaresAttackedBy(board, movedSquare);
  if (enemySqs.length === 0) return { arrows: [], descriptions: [] };

  // Build the description list (one per enemy target the moved piece
  // attacks). The UI panel reads these.
  const descriptions: AttackDescription[] = [];
  for (const t of enemySqs) {
    const tc = squareToCoords(t);
    const trow = 7 - tc.r;
    const tcol = tc.f;
    const tgt = board[trow]?.[tcol] ?? null;
    if (!tgt) continue;
    descriptions.push({
      attackerColor: attacker.color,
      attackerSquare: movedSquare,
      attackerType: attacker.type,
      targetSquare: t,
      targetType: tgt.type,
    });
  }

  // Build the arrows. Check each target: if the target also attacks the
  // moved piece, we have a mutual / "tension" pair → emit two curved
  // arrows (one each way) instead of a single straight one.
  const arrows: Arrow[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const d = descriptions[i];
    // Does the target attack the attacker back?
    const back = enemySquaresAttackedBy(board, d.targetSquare);
    if (back.includes(movedSquare)) {
      // Mutual: two curved arrows, A and B.
      arrows.push({
        from: movedSquare,
        to: d.targetSquare,
        color: d.attackerColor === 'w' ? 'blue' : 'red',
        weight: 'normal',
        pair: 'A',
        auto: true,
        descIndex: i,
      });
      arrows.push({
        from: d.targetSquare,
        to: movedSquare,
        color: d.attackerColor === 'w' ? 'red' : 'blue',
        weight: 'normal',
        pair: 'B',
        auto: true,
        descIndex: i,
      });
    } else {
      // One-way attack: single straight arrow.
      arrows.push({
        from: movedSquare,
        to: d.targetSquare,
        color: d.attackerColor === 'w' ? 'blue' : 'red',
        weight: 'normal',
        auto: true,
        descIndex: i,
      });
    }
  }

  return { arrows, descriptions };
}

// ---------- Hook ----------

export function useLiveAttacks(
  fen: string,
  enabled: boolean,
  movedSquare: Square | null,
): LiveAttackResult {
  return useMemo(() => {
    if (!enabled || !movedSquare) return { arrows: [], descriptions: [] };
    return computeLiveAttacks(fen, movedSquare);
  }, [fen, enabled, movedSquare]);
}
