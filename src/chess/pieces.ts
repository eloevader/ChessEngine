import type { PieceColor, PieceSymbol } from './types';

export const PIECE_GLYPHS: Record<PieceColor, Record<PieceSymbol, string>> = {
  w: {
    k: '\u2654',
    q: '\u2655',
    r: '\u2656',
    b: '\u2657',
    n: '\u2658',
    p: '\u2659',
  },
  b: {
    k: '\u265A',
    q: '\u265B',
    r: '\u265C',
    b: '\u265D',
    n: '\u265E',
    p: '\u265F',
  },
};

export function pieceGlyph(color: PieceColor, type: PieceSymbol): string {
  return PIECE_GLYPHS[color][type];
}
