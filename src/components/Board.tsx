import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { BoardSquare } from './BoardSquare';
import { FILES, RANKS } from '../chess/board';
import type { Square, Piece } from '../chess/types';
import { useSettings, ANIMATION_DURATIONS_MS } from '../settings/SettingsStore';
import { pieceImageUrl } from '../chess/pieces';

interface BoardProps {
  board: (Piece | null)[][];
  orientation: 'w' | 'b';
  selectedSquare: Square | null;
  legalTargets: Set<Square>;
  captureTargets: Set<Square>;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  animatingMove: { from: Square; to: Square; piece: Piece; isCapture: boolean; captured: Piece | null } | null;
  onSquareClick: (square: Square) => void;
  onPieceDragStart: (square: Square, piece: Piece) => void;
  onDragOverSquare: (square: Square) => void;
  onDropOnSquare: (square: Square) => void;
  onDragEnd: () => void;
  onAnimationDone: () => void;
}

interface DisplaySquare {
  square: Square;
  fileIdx: number;
  rankIdx: number;
  piece: Piece | null;
}

export function Board(props: BoardProps) {
  const [settings] = useSettings();
  const {
    board,
    orientation,
    selectedSquare,
    legalTargets,
    captureTargets,
    lastMove,
    kingInCheck,
    animatingMove,
    onSquareClick,
    onPieceDragStart,
    onDragOverSquare,
    onDropOnSquare,
    onDragEnd,
    onAnimationDone,
  } = props;

  const files = useMemo(
    () => (orientation === 'w' ? [...FILES] : [...FILES].reverse()),
    [orientation],
  );
  const ranks = useMemo(
    () => (orientation === 'w' ? [...RANKS].reverse() : [...RANKS]),
    [orientation],
  );

  const displaySquares = useMemo<DisplaySquare[]>(() => {
    const out: DisplaySquare[] = [];
    for (const r of ranks) {
      for (const f of files) {
        const fileIdx = FILES.indexOf(f as (typeof FILES)[number]);
        const rankIdx = parseInt(r, 10) - 1;
        const row = orientation === 'w' ? 8 - 1 - rankIdx : rankIdx;
        const col = fileIdx;
        const piece = board[row]?.[col] ?? null;
        out.push({ square: (f + r) as Square, fileIdx, rankIdx, piece });
      }
    }
    return out;
  }, [board, orientation, files, ranks]);

  return (
    <div className="board-frame">
      <div className="board-with-coords">
        {settings.showCoordinates && (
          <div className="ranks-col">
            {ranks.map((r) => (
              <div key={r} className="coord rank-coord">
                {r}
              </div>
            ))}
          </div>
        )}
        <div
          className="board"
          style={{ '--board-anim-ms': `${ANIMATION_DURATIONS_MS[settings.animationSpeed]}ms` } as CSSProperties}
        >
          {displaySquares.map(({ square, piece }) => (
            <BoardSquare
              key={square}
              square={square}
              piece={piece}
              isSelected={selectedSquare === square}
              isLegalTarget={legalTargets.has(square)}
              isCaptureTarget={captureTargets.has(square)}
              isLastMoveFrom={lastMove?.from === square}
              isLastMoveTo={lastMove?.to === square}
              isCheck={kingInCheck === square}
              onSquareClick={onSquareClick}
              onPieceDragStart={onPieceDragStart}
              onDragOverSquare={onDragOverSquare}
              onDropOnSquare={onDropOnSquare}
              onDragEnd={onDragEnd}
            />
          ))}
          {animatingMove && <AnimatedPiece anim={animatingMove} onDone={onAnimationDone} />}
        </div>
      </div>
      {settings.showCoordinates && (
        <div className="files-row">
          <div className="coord-spacer" />
          <div className="files-inner">
            {files.map((f) => (
              <div key={f} className="coord file-coord">
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AnimatedPieceProps {
  anim: { from: Square; to: Square; piece: Piece; isCapture: boolean; captured: Piece | null };
  onDone: () => void;
}

function AnimatedPiece({ anim, onDone }: AnimatedPieceProps) {
  const [settings] = useSettings();
  const duration = ANIMATION_DURATIONS_MS[settings.animationSpeed];
  const [geom, setGeom] = useState<{ fromX: number; fromY: number; dx: number; dy: number; size: number } | null>(null);

  useEffect(() => {
    const board = document.querySelector('.board') as HTMLDivElement | null;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const sq = (s: Square) => {
      const el = board.querySelector(`[data-square="${s}"]`) as HTMLElement | null;
      return el ? el.getBoundingClientRect() : null;
    };
    const from = sq(anim.from);
    const to = sq(anim.to);
    if (!from || !to) {
      onDone();
      return;
    }
    const fromX = from.left - rect.left;
    const fromY = from.top - rect.top;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    setGeom({ fromX, fromY, dx, dy, size: from.width });
  }, [anim, onDone]);

  useEffect(() => {
    if (!geom) return;
    const t = setTimeout(() => onDone(), duration + 20);
    return () => clearTimeout(t);
  }, [geom, duration, onDone]);

  if (!geom) return null;

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: geom.size,
    height: geom.size,
    transform: `translate(${geom.fromX}px, ${geom.fromY}px)`,
    pointerEvents: 'none',
    zIndex: 5,
  };

  const innerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
    animationDuration: `${duration}ms`,
    animationFillMode: 'forwards',
    animationTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    animationName: settings.animationStyle === 'arc' ? 'piece-arc' : 'piece-slide',
    ['--dx' as string]: `${geom.dx}px`,
    ['--dy' as string]: `${geom.dy}px`,
    ['--arc-lift' as string]: settings.animationSpeed === 'arcade' ? '60px' : '24px',
  };

  return (
    <div style={wrapperStyle}>
      <img
        src={pieceImageUrl(settings.pieceSet, anim.piece.color, anim.piece.type)}
        alt=""
        style={innerStyle}
        draggable={false}
      />
    </div>
  );
}
