export type PieceSetId = 'cburnett' | 'merida' | 'alpha' | 'cardinal' | 'kosal' | 'fantasy' | 'staunty' | 'caliente';

export const PIECE_SETS: { id: PieceSetId; label: string; description: string }[] = [
  { id: 'cburnett', label: 'Cburnett', description: 'Lichess default — classic look' },
  { id: 'merida', label: 'Merida', description: 'Traditional, slightly bold' },
  { id: 'alpha', label: 'Alpha', description: 'Simple outlined letters' },
  { id: 'cardinal', label: 'Cardinal', description: 'Elegant, thin strokes' },
  { id: 'kosal', label: 'Kosal', description: 'Smooth, modern feel' },
  { id: 'fantasy', label: 'Fantasy', description: 'Decorative, fantasy style' },
  { id: 'staunty', label: 'Staunty', description: 'Playful cartoon' },
  { id: 'caliente', label: 'Caliente', description: 'Bold, hot style' },
];

export function pieceImageUrl(
  set: PieceSetId,
  color: 'w' | 'b',
  type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p',
): string {
  return `pieces/${set}/${color}/${color}${type.toUpperCase()}.svg`;
}
