import type { LegalMove } from '../chess/GameState';

interface MoveHistoryProps {
  history: string[];
  sanMoves: LegalMove[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
}

export function MoveHistory({ history, currentPly, onJumpTo }: MoveHistoryProps) {
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

  return (
    <div className="move-history">
      <h3>Moves</h3>
      <div className="move-list">
        {rows.length === 0 && <div className="empty">No moves yet</div>}
        {rows.map((r) => (
          <div key={r.num} className="move-row">
            <span className="move-num">{r.num}.</span>
            <button
              className={`move-cell ${currentPly === r.whiteIndex ? 'active' : ''}`}
              onClick={() => onJumpTo(r.whiteIndex)}
            >
              {r.white ?? ''}
            </button>
            <button
              className={`move-cell ${currentPly === r.blackIndex ? 'active' : ''}`}
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
