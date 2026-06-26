interface EvalBarProps {
  /** Score in centipawns. Positive = white advantage. null = unknown / not yet evaluated. */
  scoreCp: number | null;
  /** Mate in N. Positive = white mates, negative = black mates. null = no mate. */
  scoreMate: number | null;
  /** Whether to show the score text. */
  showText?: boolean;
  /** Optional title for screen readers. */
  title?: string;
  /** Layout orientation. */
  orientation?: 'vertical' | 'horizontal';
  /** Position around the board (affects which side the text label appears on). */
  position?: 'left' | 'right' | 'top' | 'bottom';
  /** Engine status — when 'thinking' and no score yet, we still want to
   *  display a non-empty bar so the user knows the engine is alive. */
  status?: 'idle' | 'loading' | 'ready' | 'thinking' | 'error';
  /** Latest best line (used to extract depth during the warm-up window). */
  bestLine?: { depth: number } | null;
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

export function EvalBar({
  scoreCp,
  scoreMate,
  showText = true,
  title,
  orientation = 'vertical',
  position = 'left',
  status = 'thinking',
  bestLine = null,
}: EvalBarProps) {
  const hasScore = isValidScore(scoreCp, scoreMate);

  let fraction = 0.5;
  let label = '';
  let mateInProgress = false;

  if (!hasScore) {
    // No real score yet. If Stockfish is already reporting a line
    // (e.g. depth 3) but no `score cp` has arrived, show the depth so
    // the bar reads as "alive". Otherwise show the "thinking" dots.
    if (bestLine && bestLine.depth > 0) {
      label = `d${bestLine.depth}`;
    } else if (status === 'loading') {
      label = '…';
    } else if (status === 'error') {
      label = '!';
    } else {
      label = '…';
    }
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
    // Suppress the "0.00" dance: if the engine's first info line
    // is depth 1 with cp=0, we'd briefly flash "+0.00" before the
    // real eval arrives. Instead, show "d1" until the depth grows
    // past 1, OR keep showing the depth-only label if the eval is
    // exactly 0 at very low depth.
    const abs = Math.abs(scoreCp);
    if (abs < 5 && bestLine && bestLine.depth <= 2) {
      label = `d${bestLine.depth}`;
    } else {
      if (abs >= 1000) {
        label = (scoreCp / 100).toFixed(1);
      } else if (abs >= 100) {
        label = (scoreCp / 100).toFixed(2);
      } else {
        label = (scoreCp / 100).toFixed(2);
      }
      if (scoreCp > 0) label = '+' + label;
    }
    mateInProgress = false;
  }

  // Detect "engine is now looking at a forced mate" from a recent best line
  // (e.g. depth-1 reports a mate). The bar should show "M3" etc.
  if (scoreMate !== null && Number.isFinite(scoreMate) && scoreMate !== 0) {
    mateInProgress = true;
  }

  const isHorizontal = orientation === 'horizontal';
  // For vertical bars, the score label is always on the black side (top for white-bottom orientation).
  // For horizontal bars, the score label is on the left edge.
  const labelOnBlackSide = true;

  return (
    <div
      className={`eval-bar ${isHorizontal ? 'eval-bar-horizontal' : 'eval-bar-vertical'} eval-pos-${position} ${hasScore ? '' : 'eval-bar-loading'}`}
      title={title}
      data-empty={!hasScore ? 'true' : 'false'}
      data-status={status}
    >
      {isHorizontal ? (
        <>
          <div
            className="eval-bar-white-h"
            style={{ width: `${fraction * 100}%` }}
          />
          <div
            className="eval-bar-black-h"
            style={{ width: `${(1 - fraction) * 100}%` }}
          >
            {showText && <span className="eval-label eval-label-inline">{label}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="eval-bar-black" style={{ height: `${(1 - fraction) * 100}%` }}>
            {showText && labelOnBlackSide && (
              <span className="eval-label eval-label-bottom">{label}</span>
            )}
          </div>
          <div className="eval-bar-white" style={{ height: `${fraction * 100}%` }} />
        </>
      )}
      {!hasScore && (
        <div className="eval-bar-think" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      {mateInProgress && <div className="eval-bar-mate-badge">M</div>}
    </div>
  );
}
