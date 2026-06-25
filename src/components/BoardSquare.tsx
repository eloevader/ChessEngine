import type { MouseEvent as ReactMouseEvent } from 'react';
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
  isPreMoveFrom?: boolean;
  isPreMoveTo?: boolean;
  /** Optional small label drawn over the piece (e.g. the source or
   *  destination square of the last move). */
  moveLabel?: string;
  /** Optional annotation tag for the move that just landed on this
   *  square (e.g. "brilliant", "great", "blunder"). Rendered as
   *  a colored glyph over the piece. */
  moveTag?: { tag: string; label: string } | null;
  coordDisplay: CoordDisplay;
  onSquareClick: (square: Square) => void;
  onSquareRightDown: (square: Square, e: ReactMouseEvent) => void;
  onPieceDragStart: (square: Square, piece: Piece) => void;
  onDragOverSquare: (square: Square) => void;
  onDropOnSquare: (square: Square) => void;
  onDragEnd: () => void;
  onPieceTouchStart: (square: Square, piece: Piece, e: React.TouchEvent) => void;
  onPieceTouchMove: (square: Square, e: React.TouchEvent) => void;
  onPieceTouchEnd: (square: Square) => void;
}

function tagGlyph(tag: string): string {
  switch (tag) {
    case 'brilliant': return '!!';
    case 'great': return '!';
    case 'best': return '★';
    case 'book': return '📖';
    case 'good': return '';
    case 'inaccuracy': return '?!';
    case 'mistake': return '?';
    case 'blunder': return '??';
    case 'neutral': return '';
    default: return '';
  }
}

function inCellCoords(square: Square, mode: CoordDisplay): { tl?: string; br?: string } {
  if (mode === 'off' || mode === 'outside') return {};
  const f = fileOf(square);
  const r = rankOf(square);
  const isLeftCol = f === 0;
  const isRightCol = f === 7;
  const isBottomRow = r === 0;
  const isTopRow = r === 7;
  const fileLabel = String.fromCharCode(97 + f);
  const rankLabel = String(r + 1);

  // 'inside' or 'all' mode — Lichess-style edge labels.
  // - a-column cells: file letter in top-left
  // - h-column cells: file letter in bottom-right
  // - row 1 cells: rank number in bottom-right
  // - row 8 cells: rank number in top-left
  // - corner cells get BOTH labels.
  const out: { tl?: string; br?: string } = {};
  const onLeftEdge = isLeftCol;
  const onRightEdge = isRightCol;
  const onBottomEdge = isBottomRow;
  const onTopEdge = isTopRow;
  if (onLeftEdge) {
    out.tl = fileLabel;
  }
  if (onTopEdge) {
    if (out.tl === undefined) out.tl = rankLabel;
    else out.tl = `${out.tl}${rankLabel}`;
  }
  if (onRightEdge) {
    out.br = fileLabel;
  }
  if (onBottomEdge) {
    if (out.br === undefined) out.br = rankLabel;
    else out.br = `${out.br}${rankLabel}`;
  }
  // In 'all' mode, also show the file+rank on every interior cell (small).
  if (mode === 'all' && !onLeftEdge && !onRightEdge && !onTopEdge && !onBottomEdge) {
    out.br = `${fileLabel}${rankLabel}`;
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
    isPreMoveFrom,
    isPreMoveTo,
    moveLabel,
    moveTag,
    coordDisplay,
    onSquareClick,
    onSquareRightDown,
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
  if (isPreMoveFrom) classes.push('pre-move-from');
  if (isPreMoveTo) classes.push('pre-move-to');

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
      onMouseDown={(e) => {
        if (e.button === 2) {
          onSquareRightDown(square, e);
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
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
      {moveLabel && (
        <span className={`move-on-board ${isLight ? 'on-light' : 'on-dark'}`}>
          {moveLabel}
        </span>
      )}
      {moveTag && (
        <span
          className={`move-annotation tag-${moveTag.tag} ${isLight ? 'on-light' : 'on-dark'}`}
          title={moveTag.label}
        >
          {tagGlyph(moveTag.tag)}
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
          onTouchEnd={() => onPieceTouchEnd(square)}
          onTouchCancel={() => onPieceTouchEnd(square)}
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
