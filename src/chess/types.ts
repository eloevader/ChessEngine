export type Square = string;

export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';
export interface Piece {
  type: PieceSymbol;
  color: PieceColor;
}

export type DragInfo = {
  from: Square;
  piece: Piece;
} | null;

export interface MoveHighlight {
  from: Square;
  to: Square;
}
