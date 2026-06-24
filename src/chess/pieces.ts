export const PIECE_GLYPHS = {
  outline: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
  },
  solid: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
  },
  classic: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
  },
  merida: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
  },
  alpha: {
    w: { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' },
    b: { k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p' },
  },
};

export type PieceSetId = keyof typeof PIECE_GLYPHS;

export const PIECE_SET_LABELS: Record<PieceSetId, string> = {
  outline: 'Outline (Unicode)',
  solid: 'Solid (Unicode)',
  classic: 'Classic (Unicode)',
  merida: 'Merida (Unicode)',
  alpha: 'Alpha (Letters)',
};

export const PIECE_SET_COLORS: Record<PieceSetId, { w: string; b: string }> = {
  outline: { w: '#ffffff', b: '#1a1a1a' },
  solid: { w: '#fff8dc', b: '#2b2b2b' },
  classic: { w: '#f8f4e3', b: '#262626' },
  merida: { w: '#e8e8e8', b: '#3a2a1a' },
  alpha: { w: '#ffffff', b: '#1a1a1a' },
};

export function pieceGlyph(
  set: PieceSetId,
  color: 'w' | 'b',
  type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p',
): string {
  return PIECE_GLYPHS[set][color][type];
}
