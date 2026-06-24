import type { LegalMove } from '../chess/GameState';

interface MoveHistoryProps {
  history: string[];
  sanMoves: LegalMove[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  onJumpStart?: () => void;
  onJumpBack?: () => void;
  onJumpForward?: () => void;
  onJumpEnd?: () => void;
}

export function MoveHistory({
  history,
  currentPly,
  onJumpTo,
  onJumpStart,
  onJumpBack,
  onJumpForward,
  onJumpEnd,
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

  return (
    <div className="move-history">
      <div className="move-history-header">
        <h3>Moves</h3>
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
        {rows.map((r) => (
          <div key={r.num} className="move-row">
            <span className="move-num">{r.num}.</span>
            <button
              className={`move-cell ${currentPly === r.whiteIndex ? 'active' : ''} ${currentPly > r.whiteIndex ? 'past' : ''}`}
              onClick={() => onJumpTo(r.whiteIndex)}
            >
              {r.white ?? ''}
            </button>
            <button
              className={`move-cell ${currentPly === r.blackIndex ? 'active' : ''} ${currentPly > r.blackIndex ? 'past' : ''}`}
              disabled={!r.black}
              onClick={() => r.black !== undefined && onJumpTo(r.blackIndex)}
            >
              {r.black ?? ''}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
