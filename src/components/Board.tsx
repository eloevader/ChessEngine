import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { CSSProperties } from 'react';
import { BoardSquare } from './BoardSquare';
import { FILES, RANKS } from '../chess/board';
import type { Square, Piece } from '../chess/types';
import { useSettings, ANIMATION_DURATIONS_MS } from '../settings/SettingsStore';
import { pieceImageUrl } from '../chess/pieces';
import type { Threat } from '../chess/threats';

interface BoardProps {
  board: (Piece | null)[][];
  orientation: 'w' | 'b';
  selectedSquare: Square | null;
  legalTargets: Set<Square>;
  captureTargets: Set<Square>;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  animatingMove: { from: Square; to: Square; piece: Piece; isCapture: boolean; captured: Piece | null } | null;
  threats?: Threat[];
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
    threats = [],
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
              coordDisplay={settings.coordDisplay}
              onSquareClick={onSquareClick}
              onPieceDragStart={onPieceDragStart}
              onDragOverSquare={onDragOverSquare}
              onDropOnSquare={onDropOnSquare}
              onDragEnd={onDragEnd}
            />
          ))}
          {animatingMove && <AnimatedPiece anim={animatingMove} onDone={onAnimationDone} />}
          {threats.length > 0 && <ThreatArrows threats={threats} orientation={orientation} />}
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

interface ThreatArrowsProps {
  threats: Threat[];
  orientation: 'w' | 'b';
}

function ThreatArrows({ threats, orientation }: ThreatArrowsProps) {
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

  if (!board || size === 0) return null;

  const cell = size / 8;
  const arrows: ReactElement[] = [];

  // Group threats by from+to to dedupe overlapping arrows
  const seen = new Set<string>();
  for (const t of threats) {
    const key = `${t.from}-${t.to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fromFile = t.from.charCodeAt(0) - 97;
    const fromRank = parseInt(t.from[1], 10) - 1;
    const toFile = t.to.charCodeAt(0) - 97;
    const toRank = parseInt(t.to[1], 10) - 1;

    // If orientation is black, flip the coordinates
    const f1 = orientation === 'w' ? fromFile : 7 - fromFile;
    const r1 = orientation === 'w' ? 7 - fromRank : fromRank;
    const f2 = orientation === 'w' ? toFile : 7 - toFile;
    const r2 = orientation === 'w' ? 7 - toRank : toRank;

    const x1 = (f1 + 0.5) * cell;
    const y1 = (r1 + 0.5) * cell;
    const x2 = (f2 + 0.5) * cell;
    const y2 = (r2 + 0.5) * cell;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    const stroke = t.attacker === 'w' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(20, 20, 20, 0.85)';

    arrows.push(
      <svg
        key={key}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 4,
          overflow: 'visible',
        }}
      >
        <defs>
          <marker
            id={`arrow-${t.attacker}-${key}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2 - (dx / len) * cell * 0.25}
          y2={y2 - (dy / len) * cell * 0.25}
          stroke={stroke}
          strokeWidth={cell * 0.18}
          strokeLinecap="round"
          markerEnd={`url(#arrow-${t.attacker}-${key})`}
          opacity={0.7}
        />
      </svg>,
    );
  }

  return <>{arrows}</>;
}

