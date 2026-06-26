// Chess.com-style move annotation icons. Each tag has an SVG
// rendered at a small size, designed to look like the chess.com
// "best move", "brilliant", "mistake", etc. glyphs. We render
// these as <svg> nodes so they scale crisply.

import type { JSX } from 'react';
import type { MoveTag } from './classifier';

interface IconProps {
  size?: number;
}

/** "!!" Brilliant — a yellow burst */
export function BrilliantIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 1 L13.8 8.5 L21 7 L15.5 12 L21 17 L13.8 15.5 L12 23 L10.2 15.5 L3 17 L8.5 12 L3 7 L10.2 8.5 Z"
        fill="#fa9c2c"
        stroke="#fff"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2" fill="#fff" />
    </svg>
  );
}

/** "!" Great — green with an exclamation glyph */
export function GreatIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#5fb760" stroke="#fff" strokeWidth="0.6" />
      <rect x="11" y="6" width="2" height="7" fill="#fff" />
      <circle cx="12" cy="17" r="1.4" fill="#fff" />
    </svg>
  );
}

/** "✓" Best — solid green checkmark */
export function BestIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#5fb760" stroke="#fff" strokeWidth="0.6" />
      <path
        d="M7 12 L10.5 15.5 L17 9"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** "📖" Book — small book icon (used for opening moves) */
export function BookIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M3 4 L3 19 L12 17 L21 19 L21 4 L12 6 Z"
        fill="#6a8ec7"
        stroke="#fff"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <line x1="12" y1="6" x2="12" y2="17" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/** "?!" Inaccuracy — yellow with question + exclamation */
export function InaccuracyIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#e8b332" stroke="#fff" strokeWidth="0.6" />
      <path
        d="M9 9 Q9 6 12 6 Q15 6 15 9 Q15 11 12 12 L12 14"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="17" r="1.2" fill="#fff" />
      <rect x="14.5" y="14.5" width="1.6" height="3" fill="#fff" transform="rotate(35 15.3 16)" />
    </svg>
  );
}

/** "?" Mistake — orange with question mark */
export function MistakeIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#e07a35" stroke="#fff" strokeWidth="0.6" />
      <path
        d="M9 9 Q9 6 12 6 Q15 6 15 9 Q15 11 12 12 L12 14"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="17" r="1.4" fill="#fff" />
    </svg>
  );
}

/** "??" Blunder — red with double question mark */
export function BlunderIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#c94747" stroke="#fff" strokeWidth="0.6" />
      <path
        d="M8.5 8.5 Q8.5 5.5 11 5.5 Q13.5 5.5 13.5 8 Q13.5 10 11 11 L11 12"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="11" cy="14.5" r="1" fill="#fff" />
      <path
        d="M14.5 8.5 Q14.5 5.5 17 5.5 Q19.5 5.5 19.5 8 Q19.5 10 17 11 L17 12"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17" cy="14.5" r="1" fill="#fff" />
    </svg>
  );
}

const ICONS: Record<MoveTag, ((p: IconProps) => JSX.Element) | null> = {
  brilliant: BrilliantIcon,
  great: GreatIcon,
  best: BestIcon,
  book: BookIcon,
  good: null,
  inaccuracy: InaccuracyIcon,
  mistake: MistakeIcon,
  blunder: BlunderIcon,
  neutral: null,
  '?': null,
};

export function TagIcon({
  tag,
  size = 18,
}: { tag: MoveTag; size?: number }): JSX.Element | null {
  const Cmp = ICONS[tag];
  if (!Cmp) return null;
  return <Cmp size={size} />;
}
