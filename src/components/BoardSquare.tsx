import type { Piece, Square } from '../chess/types';
import { isLightSquare } from '../chess/board';
import { pieceImageUrl } from '../chess/pieces';
import { useSettings } from '../settings/SettingsStore';

interface SquareProps {
  square: Square;
  piece: Piece | null;
  isSelected: boolean;
  isLegalTarget: boolean;
  isCaptureTarget: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  isCheck: boolean;
  onSquareClick: (square: Square) => void;
  onPieceDragStart: (square: Square, piece: Piece) => void;
  onDragOverSquare: (square: Square) => void;
  onDropOnSquare: (square: Square) => void;
  onDragEnd: () => void;
}

export function BoardSquare(props: SquareProps) {
  const [settings] = useSettings();
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
    onPieceDragStart,
    onDragOverSquare,
    onDropOnSquare,
    onDragEnd,
  } = props;

  const light = isLightSquare(square);
  const classes: string[] = ['square', light ? 'light' : 'dark'];
  if (settings.highlightLastMove && (isLastMoveFrom || isLastMoveTo)) classes.push('last-move');
  if (settings.highlightCheck && isCheck && piece && piece.type === 'k') classes.push('in-check');

  const pieceClasses: string[] = ['piece', `piece-${piece?.color ?? 'w'}`];
  if (isSelected) pieceClasses.push('selected');

  const showLegalHint = settings.showLegalMoves && (isLegalTarget || isCaptureTarget);

  return (
    <div
      className={classes.join(' ')}
      data-square={square}
      onClick={() => onSquareClick(square)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverSquare(square);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnSquare(square);
      }}
    >
      {piece && (
        <img
          className={pieceClasses.join(' ')}
          src={pieceImageUrl(settings.pieceSet, piece.color, piece.type)}
          alt={`${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}`}
          draggable
          onDragStart={(e) => {
            if (!piece) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData('text/plain', square);
            e.dataTransfer.effectAllowed = 'move';
            const img = e.currentTarget;
            const rect = img.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            try {
              e.dataTransfer.setDragImage(img, offsetX, offsetY);
            } catch {
              /* some browsers reject it, fall back to default */
            }
            onPieceDragStart(square, piece);
          }}
          onDragEnd={onDragEnd}
        />
      )}
      {showLegalHint && (
        <div
          className={`legal-hint ${isCaptureTarget ? 'capture' : 'quiet'}`}
          style={isCaptureTarget ? { color: light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.40)' } : {}}
        />
      )}
    </div>
  );
}
