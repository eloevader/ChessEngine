import type { CSSProperties, DragEvent, MouseEvent } from 'react';
import type { Piece, Square } from '../chess/types';
import { isLightSquare } from '../chess/board';
import { pieceGlyph } from '../chess/pieces';

interface SquareProps {
  square: Square;
  index: number;
  piece: Piece | null;
  isSelected: boolean;
  isLegalTarget: boolean;
  isCaptureTarget: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  isCheck: boolean;
  orientation: 'w' | 'b';
  onSquareClick: (square: Square) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, square: Square, piece: Piece) => void;
  onDragOverSquare: (e: DragEvent<HTMLDivElement>, square: Square) => void;
  onDropOnSquare: (e: DragEvent<HTMLDivElement>, square: Square) => void;
  onDragEnd: () => void;
}

export function BoardSquare(props: SquareProps) {
  const {
    square,
    piece,
    isSelected,
    isLegalTarget,
    isCaptureTarget,
    isLastMoveFrom,
    isLastMoveTo,
    isCheck,
    onSquareClick,
    onDragStart,
    onDragOverSquare,
    onDropOnSquare,
    onDragEnd,
  } = props;

  const light = isLightSquare(square);
  const classes: string[] = ['square', light ? 'light' : 'dark'];
  if (isSelected) classes.push('selected');
  if (isLastMoveFrom || isLastMoveTo) classes.push('last-move');
  if (isCheck && piece && piece.type === 'k') classes.push('in-check');
  if (isLegalTarget) classes.push('legal-target');
  if (isCaptureTarget) classes.push('legal-capture');

  const style: CSSProperties = { position: 'relative' };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!piece) {
      e.preventDefault();
      return;
    }
    onDragStart(e, square, piece);
  };

  const handleClick = (_e: MouseEvent<HTMLDivElement>) => {
    onSquareClick(square);
  };

  return (
    <div
      className={classes.join(' ')}
      style={style}
      data-square={square}
      onClick={handleClick}
      onDragOver={(e) => onDragOverSquare(e, square)}
      onDrop={(e) => onDropOnSquare(e, square)}
    >
      {piece && (
        <div
          className={`piece piece-${piece.color}`}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
        >
          {pieceGlyph(piece.color, piece.type)}
        </div>
      )}
      {isLegalTarget && !isCaptureTarget && <div className="legal-dot" />}
    </div>
  );
}
