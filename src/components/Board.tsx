import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { BoardSquare } from './BoardSquare';
import { ArrowLayer } from './ArrowLayer';
import { FILES, RANKS } from '../chess/board';
import type { Square, Piece } from '../chess/types';
import { useSettings, ANIMATION_DURATIONS_MS } from '../settings/SettingsStore';
import { pieceImageUrl } from '../chess/pieces';
import type { Arrow, ArrowColor } from '../chess/threats';

interface BoardProps {
  board: (Piece | null)[][];
  orientation: 'w' | 'b';
  selectedSquare: Square | null;
  legalTargets: Set<Square>;
  captureTargets: Set<Square>;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  animatingMove: { from: Square; to: Square; piece: Piece; isCapture: boolean; captured: Piece | null } | null;
  arrows: Arrow[];
  arrowColor: ArrowColor;
  onArrowDraw: (from: Square, to: Square, color: ArrowColor) => void;
  onArrowEraseAt: (square: Square) => void;
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

interface TouchDrag {
  from: Square;
  piece: Piece;
  pointerX: number;
  pointerY: number;
  size: number;
}

const TOUCH_LONG_PRESS_MS = 150;
const TOUCH_SLOP_PX = 8;

export function Board(props: BoardProps) {
  const settings = useSettings();
  const {
    board,
    orientation,
    selectedSquare,
    legalTargets,
    captureTargets,
    lastMove,
    kingInCheck,
    animatingMove,
    arrows,
    arrowColor,
    onArrowDraw,
    onArrowEraseAt,
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
        const row = 7 - rankIdx;
        const col = fileIdx;
        const piece = board[row]?.[col] ?? null;
        out.push({ square: (f + r) as Square, fileIdx, rankIdx, piece });
      }
    }
    return out;
  }, [board, files, ranks]);

  const showOutside = settings.coordDisplay === 'outside';

  // -------- Right-click arrow drawing (chess.com style) --------
  const [arrowDraft, setArrowDraft] = useState<
    { from: Square; pointerX: number; pointerY: number } | null
  >(null);

  /** Find the square under a viewport (clientX, clientY). */
  const squareAtClientPoint = useCallback((clientX: number, clientY: number): Square | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const sq = el.closest('[data-square]') as HTMLElement | null;
    return (sq?.dataset.square as Square | undefined) ?? null;
  }, []);

  // Track right-button mouse globally while a drag is in progress.
  useEffect(() => {
    if (!arrowDraft) return;
    const onMove = (e: MouseEvent) => {
      if (e.buttons !== 2) {
        // Right button released; finalize the arrow.
        const target = squareAtClientPoint(e.clientX, e.clientY);
        if (target && target !== arrowDraft.from) {
          onArrowDraw(arrowDraft.from, target, arrowColor);
        } else if (target === arrowDraft.from) {
          // Right-click on a single square erases all arrows touching it.
          onArrowEraseAt(target);
        }
        setArrowDraft(null);
        return;
      }
      setArrowDraft({ ...arrowDraft, pointerX: e.clientX, pointerY: e.clientY });
    };
    const onUp = (e: MouseEvent) => {
      const target = squareAtClientPoint(e.clientX, e.clientY);
      if (target && target !== arrowDraft.from) {
        onArrowDraw(arrowDraft.from, target, arrowColor);
      } else if (target === arrowDraft.from) {
        onArrowEraseAt(target);
      }
      setArrowDraft(null);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [arrowDraft, arrowColor, onArrowDraw, onArrowEraseAt, squareAtClientPoint]);

  const onSquareRightDown = useCallback(
    (square: Square, e: ReactMouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      setArrowDraft({ from: square, pointerX: e.clientX, pointerY: e.clientY });
    },
    [],
  );

  // -------- Touch drag (mobile) --------
  // HTML5 drag-and-drop does not work on touch devices, so we implement
  // touch-driven dragging ourselves: a long-press starts a drag, then
  // touchmove on the document tracks the finger and a ghost piece follows.
  const [touchDrag, setTouchDrag] = useState<TouchDrag | null>(null);
  const touchDragRef = useRef<TouchDrag | null>(null);
  touchDragRef.current = touchDrag;
  const longPressTimer = useRef<number | null>(null);
  const startPoint = useRef<{ x: number; y: number; square: Square; piece: Piece } | null>(null);
  const boardElRef = useRef<HTMLDivElement | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    startPoint.current = null;
  }, []);

  const endTouchDrag = useCallback(
    (dropSquare: Square | null) => {
      clearLongPress();
      const drag = touchDragRef.current;
      touchDragRef.current = null;
      setTouchDrag(null);
      if (drag) {
        if (dropSquare) onDropOnSquare(dropSquare);
        else onDragEnd();
      }
    },
    [clearLongPress, onDropOnSquare, onDragEnd],
  );

  // Find the board square whose [data-square] element contains the given point.
  const squareAtPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!el) return null;
      const squareEl = el.closest('[data-square]') as HTMLElement | null;
      return (squareEl?.dataset.square as Square | undefined) ?? null;
    },
    [],
  );

  // Document-level touchmove/touchend listeners, attached only while dragging.
  useEffect(() => {
    if (!touchDrag) return;
    const onMove = (e: TouchEvent) => {
      // Cancel if a second finger goes down (pinch / multi-touch)
      if (e.touches.length !== 1) {
        endTouchDrag(null);
        return;
      }
      const t = e.touches[0];
      const drag = touchDragRef.current;
      if (!drag) return;
      // Convert viewport coordinates to board-local coordinates.
      const boardEl = boardElRef.current;
      const rect = boardEl?.getBoundingClientRect();
      const localX = rect ? t.clientX - rect.left : t.clientX;
      const localY = rect ? t.clientY - rect.top : t.clientY;
      setTouchDrag({ ...drag, pointerX: localX, pointerY: localY });
      e.preventDefault();
      const sq = squareAtPoint(t.clientX, t.clientY);
      if (sq) onDragOverSquare(sq);
    };
    const onEnd = (e: TouchEvent) => {
      // Use the last known touch position; if no changedTouches, fall back
      // to the current drag pointer position.
      const last = e.changedTouches[0];
      const drag = touchDragRef.current;
      const x = last?.clientX ?? drag?.pointerX ?? 0;
      const y = last?.clientY ?? drag?.pointerY ?? 0;
      const sq = squareAtPoint(x, y);
      endTouchDrag(sq);
    };
    const onCancel = () => endTouchDrag(null);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [touchDrag, endTouchDrag, onDragOverSquare, squareAtPoint]);

  const onPieceTouchStart = useCallback(
    (square: Square, piece: Piece, e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startPoint.current = { x: t.clientX, y: t.clientY, square, piece };
      if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = window.setTimeout(() => {
        const sp = startPoint.current;
        if (!sp) return;
        const boardEl = boardElRef.current;
        const rect = boardEl?.getBoundingClientRect();
        const size = boardEl ? boardEl.getBoundingClientRect().width / 8 : 40;
        // Begin the drag: select the square (shows legal targets) and
        // start tracking the finger with a ghost piece.
        onPieceDragStart(sp.square, sp.piece);
        // Store pointer in board-local coordinates so the ghost is positioned
        // correctly regardless of board offset on the page.
        touchDragRef.current = {
          from: sp.square,
          piece: sp.piece,
          pointerX: rect ? sp.x - rect.left : sp.x,
          pointerY: rect ? sp.y - rect.top : sp.y,
          size,
        };
        setTouchDrag(touchDragRef.current);
        longPressTimer.current = null;
      }, TOUCH_LONG_PRESS_MS);
    },
    [onPieceDragStart],
  );

  const onPieceTouchMove = useCallback(
    (_square: Square, e: React.TouchEvent) => {
      // If user moves significantly before long-press fires, treat as a
      // scroll gesture and cancel the pending drag.
      const sp = startPoint.current;
      if (!sp) return;
      const t = e.touches[0];
      const dx = t.clientX - sp.x;
      const dy = t.clientY - sp.y;
      if (Math.hypot(dx, dy) > TOUCH_SLOP_PX) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const onPieceTouchEnd = useCallback(() => {
    // If long-press never fired, fall through to the click handler by
    // clearing the pending timer and letting the synthetic click fire.
    clearLongPress();
  }, [clearLongPress]);

  // Suppress click after a touch drag completes so the square doesn't
  // immediately get re-selected by the synthetic click event.
  useEffect(() => {
    if (!touchDrag) return;
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // The browser fires a click ~300ms after touchend; capture it once.
    const t = window.setTimeout(() => {
      document.addEventListener('click', swallow, { capture: true, once: true });
    }, 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [touchDrag]);

  return (
    <div className="board-frame">
      <div className="coord-box">
        <div className="coord-corner coord-corner-tl" />
        <div className="coord-edge coord-top">
          {showOutside && <div className="files-row">{files.map((f) => (
            <span key={f} className="coord file-coord">{f}</span>
          ))}</div>}
        </div>
        <div className="coord-corner coord-corner-tr" />
        <div className="coord-edge coord-left">
          {showOutside && <div className="ranks-col">{ranks.map((r) => (
            <span key={r} className="coord rank-coord">{r}</span>
          ))}</div>}
        </div>
        <div
          className="board"
          ref={boardElRef}
          style={{ '--board-anim-ms': `${ANIMATION_DURATIONS_MS[settings.animationSpeed]}ms` } as CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
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
              coordDisplay={settings.coordDisplay}
              onSquareClick={onSquareClick}
              onSquareRightDown={onSquareRightDown}
              onPieceDragStart={onPieceDragStart}
              onDragOverSquare={onDragOverSquare}
              onDropOnSquare={onDropOnSquare}
              onDragEnd={onDragEnd}
              onPieceTouchStart={onPieceTouchStart}
              onPieceTouchMove={onPieceTouchMove}
              onPieceTouchEnd={onPieceTouchEnd}
            />
          ))}
          {animatingMove && <AnimatedPiece anim={animatingMove} onDone={onAnimationDone} />}
          <ArrowLayer
            arrows={arrows}
            orientation={orientation}
            preview={
              arrowDraft
                ? {
                    from: arrowDraft.from,
                    toX: arrowDraft.pointerX,
                    toY: arrowDraft.pointerY,
                    color: arrowColor,
                  }
                : null
            }
          />
          {touchDrag && (
            <div
              className="touch-ghost"
              aria-hidden="true"
              style={{
                left: touchDrag.pointerX - touchDrag.size / 2,
                top: touchDrag.pointerY - touchDrag.size / 2,
                width: touchDrag.size,
                height: touchDrag.size,
              }}
            >
              <img
                src={pieceImageUrl(settings.pieceSet, touchDrag.piece.color, touchDrag.piece.type)}
                alt=""
                draggable={false}
              />
            </div>
          )}
        </div>
        <div className="coord-edge coord-right">
          {showOutside && <div className="ranks-col">{ranks.map((r) => (
            <span key={r} className="coord rank-coord">{r}</span>
          ))}</div>}
        </div>
        <div className="coord-corner coord-corner-bl" />
        <div className="coord-edge coord-bottom">
          {showOutside && <div className="files-row">{files.map((f) => (
            <span key={f} className="coord file-coord">{f}</span>
          ))}</div>}
        </div>
        <div className="coord-corner coord-corner-br" />
      </div>
    </div>
  );
}

interface AnimatedPieceProps {
  anim: { from: Square; to: Square; piece: Piece; isCapture: boolean; captured: Piece | null };
  onDone: () => void;
}

function AnimatedPiece({ anim, onDone }: AnimatedPieceProps) {
  const settings = useSettings();
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

