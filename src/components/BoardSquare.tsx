import type { Piece, Square } from '../chess/types';
import { isLightSquare, fileOf, rankOf } from '../chess/board';
import { pieceImageUrl } from '../chess/pieces';
import { useSettings, type CoordDisplay } from '../settings/SettingsStore';

interface SquareProps {
  square: Square;
  piece: Piece | null;
  isSelected: boolean;
  isLegalTarget: boolean;
  isCaptureTarget: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  isCheck: boolean;
  /** True when this square is attacked by the piece that just moved (review mode). */
  isThreatened: boolean;
  coordDisplay: CoordDisplay;
  onSquareClick: (square: Square) => void;
  onPieceDragStart: (square: Square, piece: Piece) => void;
  onDragOverSquare: (square: Square) => void;
  onDropOnSquare: (square: Square) => void;
  onDragEnd: () => void;
  onPieceTouchStart: (square: Square, piece: Piece, e: React.TouchEvent) => void;
  onPieceTouchMove: (square: Square, e: React.TouchEvent) => void;
  onPieceTouchEnd: () => void;
}

function inCellCoords(square: Square, mode: CoordDisplay): { tl?: string; br?: string } {
  if (mode === 'off') return {};
  const f = fileOf(square);
  const r = rankOf(square);
  const isLeftCol = f === 0;
  const isRightCol = f === 7;
  const isBottomRow = r === 0;
  const isTopRow = r === 7;
  const fileLabel = String.fromCharCode(97 + f);
  const rankLabel = String(r + 1);

  if (mode === 'all') {
    return { br: `${fileLabel}${rankLabel}` };
  }

  // 'inside' mode - Lichess style:
  // - a-column cells: 'a' in top-left
  // - h-column cells: 'h' in bottom-right
  // - row 1 cells: '1' in bottom-right
  // - row 8 cells: '8' in top-left
  const out: { tl?: string; br?: string } = {};
  if (isLeftCol && isBottomRow) {
    out.tl = fileLabel;
    out.br = rankLabel;
  } else if (isLeftCol) {
    out.tl = fileLabel;
  } else if (isRightCol && isTopRow) {
    out.tl = rankLabel;
    out.br = fileLabel;
  } else if (isRightCol) {
    out.br = fileLabel;
  } else if (isBottomRow) {
    out.br = rankLabel;
  } else if (isTopRow) {
    out.tl = rankLabel;
  }
  return out;
}

export function BoardSquare(props: SquareProps) {
  const settings = useSettings();
  const {
    square,
    piece,
    isSelected,
    isLegalTarget,
    isCaptureTarget,
    isLastMoveFrom,
    isLastMoveTo,
    isCheck,
    isThreatened,
    coordDisplay,
    onSquareClick,
    onPieceDragStart,
    onDragOverSquare,
    onDropOnSquare,
    onDragEnd,
    onPieceTouchStart,
    onPieceTouchMove,
    onPieceTouchEnd,
  } = props;

  const light = isLightSquare(square);
  const classes: string[] = ['square', light ? 'light' : 'dark'];
  if (settings.highlightLastMove && (isLastMoveFrom || isLastMoveTo)) classes.push('last-move');
  if (settings.highlightCheck && isCheck && piece && piece.type === 'k') classes.push('in-check');
  if (isThreatened) classes.push('threatened');

  const pieceClasses: string[] = ['piece', `piece-${piece?.color ?? 'w'}`];
  if (isSelected) pieceClasses.push('selected');

  const showLegalHint = settings.showLegalMoves && (isLegalTarget || isCaptureTarget);
  const inCell = inCellCoords(square, coordDisplay);
  const isLight = light;

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
      {coordDisplay !== 'off' && inCell.tl && (
        <span className={`coord-incell tl ${isLight ? 'on-light' : 'on-dark'}`}>
          {inCell.tl}
        </span>
      )}
      {coordDisplay !== 'off' && inCell.br && (
        <span className={`coord-incell br ${isLight ? 'on-light' : 'on-dark'}`}>
          {inCell.br}
        </span>
      )}
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
          onTouchStart={(e) => onPieceTouchStart(square, piece, e)}
          onTouchMove={(e) => onPieceTouchMove(square, e)}
          onTouchEnd={onPieceTouchEnd}
          onTouchCancel={onPieceTouchEnd}
        />
      )}
      {showLegalHint && (
        <div
          className={`legal-hint ${isCaptureTarget ? 'capture' : 'quiet'}`}
          style={isCaptureTarget ? { color: light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.40)' } : {}}
        />
      )}
      {isThreatened && <div className="threat-dot" aria-hidden="true" />}
    </div>
  );
}
