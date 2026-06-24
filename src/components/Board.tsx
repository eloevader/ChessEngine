import { useMemo } from 'react';
import type { DragEvent } from 'react';
import { BoardSquare } from './BoardSquare';
import { FILES, RANKS } from '../chess/board';
import type { Square, Piece } from '../chess/types';

interface BoardProps {
  board: (Piece | null)[][];
  orientation: 'w' | 'b';
  selectedSquare: Square | null;
  legalTargets: Set<Square>;
  captureTargets: Set<Square>;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  onSquareClick: (square: Square) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, from: Square, piece: Piece) => void;
  onDragOverSquare: (e: DragEvent<HTMLDivElement>, square: Square) => void;
  onDropOnSquare: (e: DragEvent<HTMLDivElement>, square: Square) => void;
  onDragEnd: () => void;
}

export function Board(props: BoardProps) {
  const {
    board,
    orientation,
    selectedSquare,
    legalTargets,
    captureTargets,
    lastMove,
    kingInCheck,
    onSquareClick,
    onDragStart,
    onDragOverSquare,
    onDropOnSquare,
    onDragEnd,
  } = props;

  const files = useMemo(
    () => (orientation === 'w' ? [...FILES] : [...FILES].reverse()),
    [orientation],
  );
  const ranks = useMemo(
    () => (orientation === 'w' ? [...RANKS].reverse() : [...RANKS]),
    [orientation],
  );

  const displaySquares = useMemo(() => {
    const out: { square: Square; fileIdx: number; rankIdx: number; piece: Piece | null }[] = [];
    for (const r of ranks) {
      for (const f of files) {
        const square = (f + r) as Square;
        const fileIdx = FILES.indexOf(f as (typeof FILES)[number]);
        const rankIdx = parseInt(r, 10) - 1;
        const row = orientation === 'w' ? 8 - 1 - rankIdx : rankIdx;
        const col = fileIdx;
        const piece = board[row]?.[col] ?? null;
        out.push({ square, fileIdx, rankIdx, piece });
      }
    }
    return out;
  }, [board, orientation, files, ranks]);

  return (
    <div className="board-frame">
      <div className="board-with-coords">
        <div className="ranks-col">
          {ranks.map((r) => (
            <div key={r} className="coord rank-coord">
              {r}
            </div>
          ))}
        </div>
        <div className="board">
          {displaySquares.map(({ square, piece, fileIdx, rankIdx }) => (
            <BoardSquare
              key={square}
              square={square}
              index={fileIdx + rankIdx * 8}
              piece={piece}
              orientation={orientation}
              isSelected={selectedSquare === square}
              isLegalTarget={legalTargets.has(square)}
              isCaptureTarget={captureTargets.has(square)}
              isLastMoveFrom={lastMove?.from === square}
              isLastMoveTo={lastMove?.to === square}
              isCheck={kingInCheck === square}
              onSquareClick={onSquareClick}
              onDragStart={onDragStart}
              onDragOverSquare={onDragOverSquare}
              onDropOnSquare={onDropOnSquare}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </div>
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
    </div>
  );
}
