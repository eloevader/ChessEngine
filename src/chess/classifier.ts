// Move classification (chess.com-style).
//
// We classify each move the player makes as one of:
//   - book        : the move is in a known opening line
//   - brilliant   : finds a move only strong engines find, in a
//                   tactical/complex position, AND the position was
//                   losing or the move creates a winning attack
//   - great       : a strong move — the engine's top choice
//   - best        : the engine's top choice
//   - good        : a small eval-loss but still a reasonable move
//   - inaccuracy  : a noticeable eval-loss (50–100 cp)
//   - mistake     : a serious eval-loss (100–300 cp)
//   - blunder     : a catastrophic eval-loss (> 300 cp)
//
// All values use centipawns. Positive = good for the side that just
// moved. The classifier returns a tag, a numeric score (for sorting),
// and a short description.

export type MoveTag =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'good'
  | 'neutral'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | '?'; // unknown / not enough data

export interface MoveEval {
  /** Centipawn eval of the position AFTER this move, from the
   *  side-that-just-moved's perspective. */
  cpAfter: number;
  /** Centipawn eval of the position BEFORE this move, from the
   *  side-that-just-moved's perspective (i.e. the opponent's view of
   *  the position, negated). */
  cpBefore: number;
  /** Engine's best move at the pre-position (e.g. "e2e4"). */
  bestMove: string | null;
  /** Engine's evaluation of its best move (cp from the side-to-move
   *  before, which is the opponent's perspective). */
  bestCp: number | null;
  /** True if the played move was the only move that didn't lose
   *  significantly. Detected by counting legal moves and checking
   *  their evaluations. */
  wasOnlyGoodMove: boolean;
}

export interface ClassifiedMove {
  tag: MoveTag;
  /** Numeric score for sorting: higher = better. */
  score: number;
  /** One-line description for the UI. */
  description: string;
}

/** A full classification row for a single ply, including the FEN,
 *  SAN, eval data, and the human-readable label. */
export interface ClassifiedPly {
  ply: number;
  san: string;
  fen: string;
  eval: MoveEval | null;
  classification: ClassifiedMove;
  book: { inBook: boolean; opening: string | null };
  isCheck: boolean;
  isMating: boolean;
}

/** Tiny opening book: a hard-coded list of well-known opening
 *  positions and the moves considered "book" for them. We only
 *  classify the first ~12 ply as book at most. This is enough to
 *  recognize common openings; anything not in the list falls through
 *  to the engine evaluation. The book stores positions by their
 *  FEN-after-...-ply prefix. */
const BOOK_OPENINGS: Array<{ name: string; moves: string[] }> = [
  { name: "King's Pawn", moves: ['e4'] },
  { name: "Queen's Pawn", moves: ['d4'] },
  { name: 'Italian', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { name: 'Ruy López', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { name: 'Sicilian Najdorf', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { name: 'Sicilian Dragon', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
  { name: 'French', moves: ['e4', 'e6'] },
  { name: 'Caro-Kann', moves: ['e4', 'c6'] },
  { name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'] },
  { name: 'King’s Indian', moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { name: "King's Indian Attack", moves: ['Nf3', 'd5', 'g3'] },
  { name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'] },
  { name: 'Catalan', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'] },
  { name: 'English', moves: ['c4'] },
  { name: 'Reti', moves: ['Nf3', 'd5', 'c4'] },
];

/** Returns whether the user's history is currently inside a known
 *  opening line. A history is "in book" only if it is a strict
 *  prefix of SOME opening (i.e. every move played so far matches
 *  that opening's first N moves, where N = sanHistory.length, and
 *  N < op.moves.length so the user hasn't yet stepped off the
 *  opening's last book move). */
export function isBookMove(sanHistory: string[]): { inBook: boolean; opening: string | null } {
  if (sanHistory.length === 0) return { inBook: false, opening: null };
  // Find the LONGEST opening whose first sanHistory.length moves
  // match the user's history. The user is "in book" only if that
  // opening has MORE moves beyond what they've played (otherwise
  // they've already stepped past the last book move).
  let bestOpening: string | null = null;
  let bestLen = 0;
  for (const op of BOOK_OPENINGS) {
    if (sanHistory.length > op.moves.length) continue;
    let match = true;
    for (let i = 0; i < sanHistory.length; i++) {
      const a = sanHistory[i].replace(/[+#!?]+$/g, '');
      const b = op.moves[i].replace(/[+#!?]+$/g, '');
      if (a !== b) {
        match = false;
        break;
      }
    }
    if (match && op.moves.length > bestLen) {
      bestLen = op.moves.length;
      bestOpening = op.name;
    }
  }
  // The user is still in book only if there's an opening that
  // extends beyond what they've played. If bestLen <= sanHistory.length
  // we've reached (or passed) the last book move of the matching
  // opening.
  if (bestOpening === null) return { inBook: false, opening: null };
  if (bestLen <= sanHistory.length) return { inBook: false, opening: bestOpening };
  return { inBook: true, opening: bestOpening };
}

/** Classify a single move given the engine evaluations.
 *  - evalBefore: the side-to-move's eval at the position BEFORE the
 *    move (so for the player about to move, this is "my position").
 *  - evalAfter: the side-to-move's eval at the position AFTER the
 *    move (which is the opponent's turn, so this is "their
 *    position"). We negate this to get "my position after my move"
 *    in the same units as evalBefore.
 *  - bestMove: engine's best move at the BEFORE position
 *  - bestCpAtBest: eval at BEFORE position after the engine's best
 *    move (from the side-to-move's perspective, i.e. "my position
 *    after my best move")
 *  - wasOnlyGoodMove: true if the move was forced
 *  - wasCheck: did the move give check
 *  - movedPieceValue: value of the piece that moved (for brilliant) */
export function classifyMove(args: {
  evalBefore: number | null;
  evalAfter: number | null;
  bestMove: string | null;
  bestCpAtBest: number | null;
  wasOnlyGoodMove: boolean;
  wasCheck: boolean;
  movedPieceValue: number;
  isMating: boolean; // move leads to mate
}): ClassifiedMove {
  const {
    evalBefore,
    evalAfter,
    bestCpAtBest,
    wasOnlyGoodMove,
    wasCheck,
    isMating,
  } = args;

  if (evalBefore === null || evalAfter === null) {
    return { tag: '?', score: 0, description: 'Not enough data' };
  }

  // Convert both to "player's perspective after the move" (positive
  // = good for the player who just moved). evalBefore is from the
  // side-to-move's perspective BEFORE the move, which is the
  // player-about-to-move's perspective. That's also "my position
  // before my move". evalAfter is from the side-to-move's
  // perspective AFTER the move, which is the OPPONENT's view. So we
  // negate it to get "my view after my move".
  const myBefore = evalBefore;
  const myAfter = -evalAfter;
  // Loss = how much worse the player made their position.
  const loss = myBefore - myAfter;

  // Best case for the player
  const bestAfter = bestCpAtBest === null ? myAfter : -bestCpAtBest;
  const lossVsBest = myBefore - bestAfter;

  // Did the player play the engine's best move?
  // (We can't compare to the played move directly here, but the
  // caller tells us by passing wasOnlyGoodMove / we can use the
  // loss-vs-best threshold.)
  const playedBest = lossVsBest < 5; // within 5cp of best

  // --- BRILLIANT ---
  // Strict conditions (chess.com-style): only move that doesn't lose
  // significantly in a complex position, AND it creates a winning
  // attack (gave check, leads to mate, or won material).
  if (
    wasOnlyGoodMove &&
    (isMating || wasCheck || (myAfter - myBefore > 200)) &&
    myAfter >= 100
  ) {
    return {
      tag: 'brilliant',
      score: 5,
      description: 'Brilliant! A spectacular, hard-to-find move.',
    };
  }

  // --- GREAT ---
  // Player played the engine's best move AND it created a strong
  // advantage, OR found a "great" non-best move (still in top 2).
  if (playedBest && myAfter >= 100) {
    return {
      tag: 'great',
      score: 4,
      description: 'Great move — the best in the position.',
    };
  }
  if (loss < 15 && myAfter - myBefore > 150) {
    return {
      tag: 'great',
      score: 4,
      description: 'Great move — strong improvement.',
    };
  }

  // --- BEST ---
  if (playedBest) {
    return {
      tag: 'best',
      score: 3,
      description: 'Best move — exactly the engine\u2019s top choice.',
    };
  }

  // --- GOOD ---
  if (loss < 30) {
    return {
      tag: 'good',
      score: 2,
      description: 'Good move — solid, no significant loss.',
    };
  }

  // --- INACCURACY (50–100 cp loss) ---
  if (loss < 100) {
    return {
      tag: 'inaccuracy',
      score: 1,
      description: `Inaccuracy — small but avoidable loss (~${Math.round(loss)}cp).`,
    };
  }

  // --- MISTAKE (100–300 cp loss) ---
  if (loss < 300) {
    return {
      tag: 'mistake',
      score: 0,
      description: `Mistake — significant loss (~${Math.round(loss)}cp).`,
    };
  }

  // --- BLUNDER (>300 cp loss) ---
  return {
    tag: 'blunder',
    score: -1,
    description: `Blunder — major loss (~${Math.round(loss)}cp).`,
  };
}
