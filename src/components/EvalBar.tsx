interface EvalBarProps {
  /** Score in centipawns. Positive = white advantage. null = unknown / not yet evaluated. */
  scoreCp: number | null;
  /** Mate in N. Positive = white mates, negative = black mates. null = no mate. */
  scoreMate: number | null;
  /** Whether to show the score text. */
  showText?: boolean;
  /** Optional title for screen readers. */
  title?: string;
}

/** Maps a centipawn score to a 0-1 fraction for the white-bar height.
 *  Uses a tanh-like curve so 0 = 0.5, +100cp = ~0.55, +500cp = ~0.73, +1000cp = ~0.85. */
function scoreToFraction(cp: number): number {
  if (!Number.isFinite(cp)) return 0.5;
  const x = Math.max(-1500, Math.min(1500, cp));
  return 0.5 + 0.5 * Math.tanh(x / 400);
}

function isValidScore(cp: number | null, mate: number | null): boolean {
  if (mate !== null && Number.isFinite(mate)) return true;
  if (cp !== null && Number.isFinite(cp)) return true;
  return false;
}

export function EvalBar({ scoreCp, scoreMate, showText = true, title }: EvalBarProps) {
  const hasScore = isValidScore(scoreCp, scoreMate);

  let fraction = 0.5;
  let label = '';

  if (!hasScore) {
    label = '…';
  } else if (scoreMate !== null && Number.isFinite(scoreMate)) {
    if (scoreMate === 0) {
      fraction = 0.5;
      label = '0';
    } else if (scoreMate > 0) {
      fraction = 1;
      label = `M${Math.abs(scoreMate)}`;
    } else {
      fraction = 0;
      label = `M${Math.abs(scoreMate)}`;
    }
  } else if (scoreCp !== null && Number.isFinite(scoreCp)) {
    fraction = scoreToFraction(scoreCp);
    if (Math.abs(scoreCp) >= 100) {
      label = (scoreCp / 100).toFixed(1);
    } else {
      label = (scoreCp / 100).toFixed(2);
    }
    if (scoreCp > 0) label = '+' + label;
  }

  return (
    <div className="eval-bar" title={title} data-empty={!hasScore ? 'true' : 'false'}>
      <div className="eval-bar-black" style={{ height: `${(1 - fraction) * 100}%` }}>
        {showText && <span className="eval-label eval-label-bottom">{label}</span>}
      </div>
      <div className="eval-bar-white" style={{ height: `${fraction * 100}%` }} />
    </div>
  );
}
