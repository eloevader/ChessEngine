import type { Square } from '../chess/types';
import { GameState } from './GameState';

export type ArrowColor = 'green' | 'red' | 'yellow' | 'blue' | 'purple';

export interface Arrow {
  from: Square;
  to: Square;
  color: ArrowColor;
  /** Optional visual hint for the renderer (thickness, dashed, etc.). */
  weight?: 'thin' | 'normal' | 'thick';
  /** Dashed = X-Ray / line-of-sight through a piece. */
  dashed?: boolean;
  /** True when the arrow originates from the last-moved piece (auto-drawn threat). */
  auto?: boolean;
}

// Piece values (for blunder detection / attacker-vs-target priority).
export const PIECE_VALUE: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

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

export type Piece = { type: string; color: 'w' | 'b' };

/** Internal: list every piece on the board, indexed by square. */
type Board = (Piece | null)[][];

/** All squares a piece of `kind`/`color` on (col, row) attacks.
 *  Returns the squares AND the list of squares the attack ray passes
 *  through, so callers can decide whether something is an X-ray through
 *  a piece.
 *
 *  - For non-sliding pieces: `path` is just the single target square.
 *  - For sliding pieces: `path` is the full line of squares from the
 *    attacker to (and including) the first piece encountered, OR the end
 *    of the board. If the first piece in path is an opponent's piece,
 *    that square is a "direct" target; the squares beyond it (with the
 *    blocker excluded) are X-ray candidates. */
function attackLines(
  board: Board,
  col: number,
  row: number,
  kind: string,
  color: 'w' | 'b',
): { targets: Square[]; path: Square[]; kind: 'knight' | 'other' | 'sliding' } {
  const pawnDir = color === 'w' ? 1 : -1;
  const pawnAttacks: [number, number][] = [[-1, pawnDir], [1, pawnDir]];

  let dirs: [number, number][] = [];
  let lineKind: 'knight' | 'other' | 'sliding' = 'other';
  switch (kind) {
    case 'p': dirs = pawnAttacks; break;
    case 'n': dirs = KNIGHT_MOVES; lineKind = 'knight'; break;
    case 'b': dirs = BISHOP_DIRS; lineKind = 'sliding'; break;
    case 'r': dirs = ROOK_DIRS; lineKind = 'sliding'; break;
    case 'q': dirs = [...BISHOP_DIRS, ...ROOK_DIRS]; lineKind = 'sliding'; break;
    case 'k': dirs = KING_MOVES; break;
    default: return { targets: [], path: [], kind: lineKind };
  }

  const targets: Square[] = [];
  const path: Square[] = [];
  const isSliding = SLIDING.has(kind);

  for (const [df, dr] of dirs) {
    if (!isSliding) {
      const tf = col + df;
      const tr = row + dr;
      if (!inBounds(tf, tr)) continue;
      targets.push(squareAt(tf, tr));
      path.push(squareAt(tf, tr));
      continue;
    }
    let tf = col + df;
    let tr = row + dr;
    const ray: Square[] = [];
    while (inBounds(tf, tr)) {
      const sq = squareAt(tf, tr);
      ray.push(sq);
      const blocker = board[tr]?.[tf] ?? null;
      if (blocker) {
        // First piece hit: include it as a direct target if opponent.
        if (blocker.color !== color) targets.push(sq);
        break;
      }
      tf += df;
      tr += dr;
    }
    path.push(...ray);
  }
  return { targets, path, kind: lineKind };
}

// ---------- Attack map (per-square list of attackers) ----------

/** A record of every square that is attacked, with the attackers. */
export interface AttackMap {
  /** For each square: the list of pieces (with their squares) that attack it. */
  bySquare: Map<Square, { from: Square; piece: Piece }[]>;
  /** For each square: the list of pieces of the SAME color that defend it. */
  defenders: Map<Square, { from: Square; piece: Piece }[]>;
}

/** Build the full attack map for the given board state. */
export function buildAttackMap(fen: string): AttackMap {
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Board } })
    .chess.board();
  const bySquare = new Map<Square, { from: Square; piece: Piece }[]>();
  const defenders = new Map<Square, { from: Square; piece: Piece }[]>();

  // For every piece on the board, compute its attack lines and record:
  //   - the squares it attacks (which become "attacked" squares, and the
  //     reverse map: who defends each square).
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c] ?? null;
      if (!p) continue;
      const fromSq = squareAt(c, r);
      const { targets } = attackLines(board, c, r, p.type, p.color);
      for (const t of targets) {
        // The piece at `t` is being attacked by the piece at `fromSq`.
        if (!bySquare.has(t)) bySquare.set(t, []);
        bySquare.get(t)!.push({ from: fromSq, piece: p });
        // A piece on `t` is being defended by every same-color attacker.
        const target = board[squareToCoords(t).r]?.[squareToCoords(t).f] ?? null;
        if (target && target.color === p.color) {
          if (!defenders.has(t)) defenders.set(t, []);
          defenders.get(t)!.push({ from: fromSq, piece: p });
        }
      }
    }
  }
  return { bySquare, defenders };
}

// ---------- ThreatAnalyzer ----------

export type ThreatKind =
  | 'hanging'      // attacker on an undefended enemy piece
  | 'trade'        // attacker on a defended enemy piece
  | 'check'        // attacker on the enemy king
  | 'xray'         // sliding piece through a blocker onto a high-value target
  | 'pin'          // attacker onto an enemy piece that would expose the king
  | 'defended'     // generic attack on an enemy piece (defender covers it)
  | 'skirmish';    // both pieces attack each other (vice-versa)

export interface ThreatInfo {
  from: Square;
  to: Square;
  attacker: Piece;
  target: Piece;
  kind: ThreatKind;
  /** Material delta of capture exchange (positive = attacker wins material). */
  exchange: number;
  /** Number of enemy pieces defending the target square. */
  defenderCount: number;
  /** Number of friendly pieces also attacking the target square. */
  attackerCount: number;
}

/** Compute every attack arrow for both sides, classified by state. */
export function analyzeThreats(fen: string): ThreatInfo[] {
  const game = new GameState(fen);
  const board = (game as unknown as { chess: { board: () => Board } }).chess.board();
  const { bySquare, defenders } = buildAttackMap(fen);

  // Find king squares.
  const kings: Record<'w' | 'b', Square | null> = { w: null, b: null };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c] ?? null;
      if (p && p.type === 'k') {
        kings[p.color] = squareAt(c, r);
      }
    }
  }

  const threats: ThreatInfo[] = [];

  // For every square containing a piece, find its attackers.
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const target = board[r]?.[c] ?? null;
      if (!target) continue;
      const targetSq = squareAt(c, r);
      const attackers = bySquare.get(targetSq) ?? [];
      if (attackers.length === 0) continue;

      const isTargetKing = target.type === 'k';
      const defs = defenders.get(targetSq) ?? [];
      const defenderCount = defs.length;

      for (const a of attackers) {
        if (a.piece.color === target.color) continue; // same-color attack = defender, skip
        const exchange = PIECE_VALUE[target.type] - PIECE_VALUE[a.piece.type];
        let kind: ThreatKind;
        if (isTargetKing) {
          kind = 'check';
        } else if (defenderCount === 0) {
          kind = 'hanging';
        } else {
          kind = 'trade';
        }
        threats.push({
          from: a.from,
          to: targetSq,
          attacker: a.piece,
          target,
          kind,
          exchange,
          defenderCount,
          attackerCount: attackers.filter((x) => x.piece.color === a.piece.color).length,
        });
      }
    }
  }

  return threats;
}

/** Color + style hints for each threat kind. */
export function threatStyle(t: ThreatInfo): {
  color: ArrowColor;
  weight: 'thin' | 'normal' | 'thick';
  dashed: boolean;
} {
  switch (t.kind) {
    case 'hanging':
      return { color: 'red', weight: 'thick', dashed: false };
    case 'check':
      return { color: 'red', weight: 'thick', dashed: false };
    case 'trade':
      // Defender covers it: warn in yellow.
      return { color: 'yellow', weight: 'normal', dashed: false };
    case 'xray':
      return { color: 'purple', weight: 'normal', dashed: true };
    case 'pin':
      return { color: 'blue', weight: 'normal', dashed: true };
    case 'skirmish':
      return { color: 'green', weight: 'normal', dashed: false };
    default:
      return { color: 'blue', weight: 'normal', dashed: false };
  }
}

/** Convert a list of ThreatInfo into a list of Arrows. */
export function threatsToArrows(threats: ThreatInfo[]): Arrow[] {
  return threats.map((t) => {
    const s = threatStyle(t);
    return { from: t.from, to: t.to, color: s.color, weight: s.weight, dashed: s.dashed };
  });
}

// ---------- Color presets (RGB so we can vary opacity) ----------

export const ARROW_COLORS: Record<ArrowColor, string> = {
  green: '157, 196, 85',
  red: '222, 80, 80',
  yellow: '234, 204, 65',
  blue: '85, 152, 222',
  purple: '168, 85, 222',
};
