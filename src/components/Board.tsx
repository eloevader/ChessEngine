import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { BoardSquare } from './BoardSquare';
import { ArrowLayer } from './ArrowLayer';
import { FILES, RANKS } from '../chess/board';
import type { Square, Piece } from '../chess/types';
import type { MoveTag } from '../chess/classifier';
import { useSettings, ANIMATION_DURATIONS_MS } from '../settings/SettingsStore';
import { pieceImageUrl } from '../chess/pieces';
import type { Arrow, ArrowColor } from '../chess/threats';
import { ARROW_COLORS } from '../chess/threats';

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
  /** Right-click-on-square highlights (single square, no drag). */
  squareHighlights: Map<Square, ArrowColor>;
  arrowColor: ArrowColor;
  /** Pre-move indicators. Each entry is one queued pre-move.
   *  `from` is the starting square, `to` the destination. The
   *  optional `pending` flag marks the from square the user just
   *  clicked but hasn't yet chosen a destination for. */
  preMoveHighlights?: Array<{ from: Square; to: Square; pending?: boolean }> | null;
  /** Optional annotation for the move that landed on a given square.
   *  Map keyed by destination square (e.g. "e4"). */
  moveTagsByTo?: Map<Square, { tag: MoveTag; label: string }>;
  onArrowDraw: (from: Square, to: Square, color: ArrowColor) => void;
  onArrowEraseAt: (square: Square) => void;
  onSquareRightClick: (square: Square, color: ArrowColor) => void;
  /** Called when the user wants to clear their pre-move queue (e.g.
   *  by right-clicking on the board while pre-moves are queued). */
  onClearPreMoves?: () => void;
  /** Whether the user currently has pre-moves queued. When true, a
   *  right-click anywhere on the board discards the queue (and
   *  does NOT draw an arrow). */
  hasPreMoves?: boolean;
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
    squareHighlights,
    arrowColor,
    preMoveHighlights,
    moveTagsByTo,
    hasPreMoves,
    onClearPreMoves,
    onArrowDraw,
    onArrowEraseAt,
    onSquareRightClick,
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

  const showOutside = settings.coordDisplay === 'outside' || settings.coordDisplay === 'all';

  // -------- Right-click arrow drawing (chess.com style) --------
  // `arrowDraft` holds the current drag-in-progress (only set while the
  // user is interacting with the right mouse button). We also keep a ref
  // so the document-level mousemove / mouseup listeners — which are
  // attached exactly once when the draft starts — can read the latest
  // draft value without re-binding on every render. That avoids a tight
  // add/remove loop and lost events when the user drags fast.
  const [arrowDraft, setArrowDraft] = useState<
    { from: Square; pointerX: number; pointerY: number } | null
  >(null);
  const arrowDraftRef = useRef<{ from: Square; pointerX: number; pointerY: number } | null>(null);
  arrowDraftRef.current = arrowDraft;

  // Latest callbacks in refs so the document listeners (attached once)
  // can always reach the current handlers without re-binding.
  const arrowColorRef = useRef(arrowColor);
  arrowColorRef.current = arrowColor;
  const onArrowDrawRef = useRef(onArrowDraw);
  onArrowDrawRef.current = onArrowDraw;
  const onArrowEraseAtRef = useRef(onArrowEraseAt);
  onArrowEraseAtRef.current = onArrowEraseAt;
  const onSquareRightClickRef = useRef(onSquareRightClick);
  onSquareRightClickRef.current = onSquareRightClick;

  /** Find the square under a viewport (clientX, clientY). */
  const squareAtClientPoint = useCallback((clientX: number, clientY: number): Square | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const sq = el.closest('[data-square]') as HTMLElement | null;
    return (sq?.dataset.square as Square | undefined) ?? null;
  }, []);

  // Track right-button mouse globally while a drag is in progress.
  //
  // Behavior (chess.com style):
  //   - Right-DRAG from square A to square B (any motion) → draw an
  //     arrow A→B in the currently selected color.
  //   - Right-CLICK (no movement) on a square → fill that square with
  //     the currently selected color (toggle if same color+square).
  //
  // Implementation: listeners are attached SYNCHRONOUSLY in
  // `handleSquareRightDown` (not via useEffect), so a fast mousedown →
  // mouseup can never lose the drag — there is no "effect hasn't run
  // yet" window.
  const DRAG_THRESHOLD_PX = 4;
  const handleSquareRightDown = useCallback(
    (square: Square, e: ReactMouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      // If the user has pre-moves queued, any right-click discards
      // them. Skip arrow drawing for this click.
      if (hasPreMoves && onClearPreMoves) {
        onClearPreMoves();
        return;
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const fromSq = square;
      let dragged = false;
      let cancelled = false;

      // Live preview state. Stored in a ref + a state var so the
      // preview layer re-renders as the pointer moves.
      const draft = { from: fromSq, pointerX: startX, pointerY: startY };
      arrowDraftRef.current = draft;
      setArrowDraft(draft);

      const finalize = (clientX: number, clientY: number) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('contextmenu', onContext);
        if (cancelled) return;
        const target = squareAtClientPoint(clientX, clientY);
        if (dragged) {
          // Drag completed. Only produce an arrow if the user released
          // over a DIFFERENT square.
          if (target && target !== fromSq) {
            onArrowDrawRef.current(fromSq, target, arrowColorRef.current);
          }
        } else {
          // Pointer didn't move past the drag threshold → treat as a
          // single right-click: fill the target square with the
          // currently selected color.
          if (target) {
            onSquareRightClickRef.current(target, arrowColorRef.current);
          }
        }
        setArrowDraft(null);
        arrowDraftRef.current = null;
      };
      const onMove = (ev: MouseEvent) => {
        if (ev.buttons !== 2) {
          cancelled = true;
          finalize(ev.clientX, ev.clientY);
          return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragged = true;
        const next = { from: fromSq, pointerX: ev.clientX, pointerY: ev.clientY };
        arrowDraftRef.current = next;
        setArrowDraft(next);
      };
      const onUp = (ev: MouseEvent) => finalize(ev.clientX, ev.clientY);
      const onContext = (ev: MouseEvent) => ev.preventDefault();

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('contextmenu', onContext);
    },
    [squareAtClientPoint, hasPreMoves, onClearPreMoves],
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
              isPreMoveFrom={
                preMoveHighlights?.some(
                  (p) => (p.from === square || p.pending === true) && p.from === square,
                ) ?? false
              }
              isPreMoveTo={
                preMoveHighlights?.some(
                  (p) => p.from !== p.to && p.to === square,
                ) ?? false
              }
              moveLabel={
                settings.moveNotationOnBoard
                  ? lastMove?.from === square
                    ? (lastMove.from as string)
                    : lastMove?.to === square
                      ? (lastMove.to as string)
                      : undefined
                  : undefined
              }
              moveTag={moveTagsByTo?.get(square) ?? null}
              coordDisplay={settings.coordDisplay}
              onSquareClick={onSquareClick}
              onSquareRightDown={handleSquareRightDown}
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
          <SquareHighlights
            highlights={squareHighlights}
            orientation={orientation}
          />
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
          {preMoveHighlights && preMoveHighlights.length > 0 && (
            <PreMoveArrow
              highlights={preMoveHighlights}
              orientation={orientation}
            />
          )}
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
  // Keep the latest onDone in a ref so the timer effect below doesn't
  // re-run (and reset the timer) every time the parent re-renders with
  // a new inline `onDone` function. Without this, `onAnimationDone` is
  // never called and the user is stuck in the "animating" state, which
  // blocks subsequent moves in computer mode.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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
      onDoneRef.current();
      return;
    }
    const fromX = from.left - rect.left;
    const fromY = from.top - rect.top;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    setGeom({ fromX, fromY, dx, dy, size: from.width });
  }, [anim]);

  useEffect(() => {
    if (!geom) return;
    const t = setTimeout(() => onDoneRef.current(), duration + 20);
    return () => clearTimeout(t);
  }, [geom, duration]);

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

interface SquareHighlightsProps {
  highlights: Map<Square, ArrowColor>;
  orientation: 'w' | 'b';
}

/** Renders single-square color highlights (e.g. right-click on a square
 *  without dragging). Each highlight fills the entire square (the cell
 *  bbox) with the chosen arrow color, at low opacity, so the cell
 *  itself is visibly tinted. */
function SquareHighlights({ highlights, orientation }: SquareHighlightsProps) {
  const [size, setSize] = useState(0);
  const [board, setBoard] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.querySelector('.board') as HTMLElement | null;
    if (!el) return;
    setBoard(el);
    const update = () => setSize(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!board || size === 0 || highlights.size === 0) return null;
  const cell = size / 8;
  const out: ReactElement[] = [];
  highlights.forEach((color, square) => {
    const f = square.charCodeAt(0) - 97;
    const r = parseInt(square[1], 10) - 1;
    const fVis = orientation === 'w' ? f : 7 - f;
    const rVis = orientation === 'w' ? 7 - r : r;
    const x = fVis * cell;
    const y = rVis * cell;
    const rgb = ARROW_COLORS[color];
    out.push(
      <rect
        key={`hl-${square}`}
        x={x}
        y={y}
        width={cell}
        height={cell}
        fill={`rgba(${rgb}, 0.55)`}
        stroke={`rgba(${rgb}, 1)`}
        strokeWidth={cell * 0.04}
        pointerEvents="none"
      />,
    );
  });
  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 3,
        overflow: 'visible',
      }}
    >
      {out}
    </svg>
  );
}

/** Renders the pre-move indicators. The from/to squares already
 *  get their colored cell highlights from BoardSquare's
 *  isPreMoveFrom / isPreMoveTo props. We previously drew a dashed
 *  arrow here, but the user wants NO arrow — just the cell tints.
 *  This component is kept as a no-op so the call site is unchanged. */
function PreMoveArrow(_: {
  highlights: Array<{ from: Square; to: Square; pending?: boolean }>;
  orientation: 'w' | 'b';
}) {
  return null;
}

