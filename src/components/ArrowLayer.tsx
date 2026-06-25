import { useEffect, useState, type ReactElement } from 'react';
import type { Square } from '../chess/types';
import { ARROW_COLORS, type Arrow } from '../chess/threats';

interface ArrowLayerProps {
  arrows: Arrow[];
  orientation: 'w' | 'b';
  /** Optional preview arrow being drawn right now (from → cursor position). */
  preview?: { from: Square; toX: number; toY: number; color: string } | null;
}

function squareCenter(
  square: Square,
  cell: number,
  orientation: 'w' | 'b',
): { x: number; y: number } {
  const f = square.charCodeAt(0) - 97;
  const r = parseInt(square[1], 10) - 1;
  const fVis = orientation === 'w' ? f : 7 - f;
  const rVis = orientation === 'w' ? 7 - r : r;
  return { x: (fVis + 0.5) * cell, y: (rVis + 0.5) * cell };
}

/** For a knight move, return an L-shaped path: from → corner → to.
 *  For straight-line moves (orthogonal or diagonal), return a single segment.
 *  The L goes "vertically" (along the file / x axis) first, then "horizontally"
 *  (along the rank / y axis). So the elbow sits at (to.x, from.y): the
 *  piece steps along the file to the target's file, then along the rank. */
function buildPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  pieceKind: 'knight' | 'other',
): string {
  if (pieceKind === 'other') {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  // Knight: file-first L. Elbow at (to.x, from.y).
  // If the file segment would be zero (same file), fall back to rank-first
  // to avoid a zero-length segment.
  if (Math.abs(to.x - from.x) < 0.5) {
    // Same file → rank-first: (from.x, from.y) → (from.x, to.y) → (to.x, to.y)
    return `M ${from.x} ${from.y} L ${from.x} ${to.y} L ${to.x} ${to.y}`;
  }
  // File-first: (from.x, from.y) → (to.x, from.y) → (to.x, to.y)
  return `M ${from.x} ${from.y} L ${to.x} ${from.y} L ${to.x} ${to.y}`;
}

export function ArrowLayer({ arrows, orientation, preview }: ArrowLayerProps) {
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
  const elements: ReactElement[] = [];

  // Dedup: if both (a→b) and (b→a) exist, skip the duplicate.
  const seen = new Set<string>();

  for (const a of arrows) {
    const key = `${a.from}->${a.to}`;
    // Note: for mutual-attack pairs, we want BOTH curved arrows rendered
    // (one from each side), so we do NOT dedup by reverse key here. The
    // tracker gives each its own `pair: 'A' | 'B'`, so the keys differ.
    if (seen.has(key) && !a.pair) continue;
    seen.add(key);

    const from = squareCenter(a.from, cell, orientation);
    const to = squareCenter(a.to, cell, orientation);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    // Shorten the arrow head so it lands on the square's edge, not center.
    const headInset = cell * 0.22;
    const ux = dx / len;
    const uy = dy / len;
    const endX = to.x - ux * headInset;
    const endY = to.y - uy * headInset;
    const adjustedTo = { x: endX, y: endY };
    // For a knight move we treat the start/end files+ranks as a knight jump
    // (|dx| and |dy| differ), regardless of whether the start piece is a
    // knight — it just describes the geometry of the arrow. chess.com does
    // the same: any non-straight move gets an L-shape.
    const fileDelta = Math.abs(a.from.charCodeAt(0) - a.to.charCodeAt(0));
    const rankDelta = Math.abs(parseInt(a.from[1], 10) - parseInt(a.to[1], 10));
    const isKnightShape = (fileDelta === 1 && rankDelta === 2) || (fileDelta === 2 && rankDelta === 1);
    const pieceKind = isKnightShape ? 'knight' : 'other';

    // For mutual attacks, the arrow curves to one side. Offset the
    // control point perpendicular to the line by ~15° worth of cell.
    let path: string;
    if (a.pair) {
      // Curved arrow using a quadratic Bezier. Side A curves to the
      // "left" of the direction, side B curves to the "right" of the
      // direction (i.e., they fan out in opposite directions).
      const sign = a.pair === 'A' ? 1 : -1;
      // Perpendicular unit vector (left of direction = (-uy, ux)).
      const perpX = -uy * sign;
      const perpY = ux * sign;
      // Offset distance: ~0.35 cell. Big enough to be visible, small
      // enough to keep the arrow close to the line.
      const offset = cell * 0.35;
      const midX = (from.x + adjustedTo.x) / 2 + perpX * offset;
      const midY = (from.y + adjustedTo.y) / 2 + perpY * offset;
      path = `M ${from.x} ${from.y} Q ${midX} ${midY} ${adjustedTo.x} ${adjustedTo.y}`;
    } else {
      path = buildPath(from, adjustedTo, pieceKind);
    }

    const color = ARROW_COLORS[a.color];
    const opacity = a.auto ? 0.78 : 0.85;
    const weightMul = a.weight === 'thick' ? 1.35 : a.weight === 'thin' ? 0.7 : 1;
    const stroke = cell * 0.16 * weightMul;
    const arrowId = `arrowhead-${a.color}-${key}`;

    elements.push(
      <g key={key} opacity={opacity}>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth={4}
          markerHeight={4}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={`rgba(${color}, 1)`} />
        </marker>
        <path
          d={path}
          stroke={`rgba(${color}, 1)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={a.dashed ? `${cell * 0.25} ${cell * 0.18}` : undefined}
          markerEnd={`url(#${arrowId})`}
        />
      </g>,
    );
  }

  // Preview (the in-progress arrow while right-click dragging)
  if (preview) {
    const from = squareCenter(preview.from, cell, orientation);
    // Convert viewport coords to board-local coords.
    const boardEl = board;
    const rect = boardEl.getBoundingClientRect();
    const localX = preview.toX - rect.left;
    const localY = preview.toY - rect.top;
    const dx = localX - from.x;
    const dy = localY - from.y;
    const len = Math.hypot(dx, dy);
    if (len >= cell * 0.3) {
      const ux = dx / len;
      const uy = dy / len;
      const headInset = cell * 0.22;
      const endX = localX - ux * headInset;
      const endY = localY - uy * headInset;
      const to = { x: endX, y: endY };
      // For preview, treat as straight line (we don't know the piece kind).
      const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      const color = ARROW_COLORS[preview.color as keyof typeof ARROW_COLORS] ?? preview.color;
      elements.push(
        <g key="preview" opacity={0.55}>
          <path
            d={path}
            stroke={`rgba(${color}, 1)`}
            strokeWidth={cell * 0.16}
            strokeLinecap="round"
            fill="none"
          />
        </g>,
      );
    }
  }

  return (
    <svg
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
      {elements}
    </svg>
  );
}
