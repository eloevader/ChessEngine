import type { LegalMove } from '../chess/GameState';
import type { ClassifiedPly, MoveTag } from '../chess/classifier';
import { TagIcon } from '../chess/moveIcons';

interface MoveHistoryProps {
  history: string[];
  sanMoves: LegalMove[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  onJumpStart?: () => void;
  onJumpBack?: () => void;
  onJumpForward?: () => void;
  onJumpEnd?: () => void;
  /** Per-ply classification (optional). When present, each move
   *  gets a colored tag dot. */
  classifications?: ClassifiedPly[];
  /** Bulk-eval progress: { done, total }. When present and
   *  done < total, a loading indicator is shown. */
  bulkProgress?: { done: number; total: number } | null;
}

const TAG_LABEL: Record<MoveTag, string> = {
  book: 'Book',
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  good: 'Good',
  neutral: 'Neutral',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  '?': 'Analyzing…',
};

export function MoveHistory({
  history,
  currentPly,
  onJumpTo,
  onJumpStart,
  onJumpBack,
  onJumpForward,
  onJumpEnd,
  classifications,
  bulkProgress,
}: MoveHistoryProps) {
  const rows: { num: number; white?: string; black?: string; whiteIndex: number; blackIndex: number }[] =
    [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }

  const atStart = currentPly <= 0;
  const atEnd = currentPly >= history.length;

  const tagFor = (ply: number): MoveTag | null => {
    if (!classifications) return null;
    const c = classifications[ply - 1];
    if (!c) return null;
    if (c.classification.tag === '?') return null;
    return c.classification.tag;
  };

  return (
    <div className="move-history">
      <div className="move-history-header">
        <h3>Moves</h3>
        {bulkProgress && bulkProgress.done < bulkProgress.total && (
          <span className="bulk-progress" title="Calculating move evaluations">
            <span className="bulk-spinner" />
            <span className="bulk-text">
              {bulkProgress.done} / {bulkProgress.total}
            </span>
          </span>
        )}
        <div className="move-nav">
          <button
            className="nav-btn"
            onClick={onJumpStart}
            disabled={!onJumpStart || atStart}
            aria-label="Jump to start"
            title="Jump to start"
          >
            {'\u23EE'}
          </button>
          <button
            className="nav-btn"
            onClick={onJumpBack}
            disabled={!onJumpBack || atStart}
            aria-label="Step back"
            title="Step back"
          >
            {'\u23EA'}
          </button>
          <button
            className="nav-btn"
            onClick={onJumpForward}
            disabled={!onJumpForward || atEnd}
            aria-label="Step forward"
            title="Step forward"
          >
            {'\u23E9'}
          </button>
          <button
            className="nav-btn"
            onClick={onJumpEnd}
            disabled={!onJumpEnd || atEnd}
            aria-label="Jump to end"
            title="Jump to end"
          >
            {'\u23ED'}
          </button>
        </div>
      </div>
      <div className="move-list">
        {rows.length === 0 && <div className="empty">No moves yet</div>}
        {rows.map((r) => {
          const wTag = tagFor(r.whiteIndex + 1);
          const bTag = tagFor(r.blackIndex + 1);
          return (
            <div key={r.num} className="move-row">
              <span className="move-num">{r.num}.</span>
              <button
                className={`move-cell ${currentPly === r.whiteIndex + 1 ? 'active' : ''} ${currentPly > r.whiteIndex + 1 ? 'past' : ''}`}
                onClick={() => onJumpTo(r.whiteIndex + 1)}
                title={
                  wTag
                    ? `${r.white} — ${TAG_LABEL[wTag]}`
                    : r.white
                }
              >
                <span className="move-text">{r.white ?? ''}</span>
                {wTag && (
                  <span className={`move-icon icon-${wTag}`}>
                    <TagIcon tag={wTag} size={14} />
                  </span>
                )}
              </button>
              <button
                className={`move-cell ${currentPly === r.blackIndex + 1 ? 'active' : ''} ${currentPly > r.blackIndex + 1 ? 'past' : ''}`}
                disabled={!r.black}
                onClick={() => r.black !== undefined && onJumpTo(r.blackIndex + 1)}
                title={bTag ? `${r.black} — ${TAG_LABEL[bTag]}` : r.black}
              >
                <span className="move-text">{r.black ?? ''}</span>
                {bTag && (
                  <span className={`move-icon icon-${bTag}`}>
                    <TagIcon tag={bTag} size={14} />
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
