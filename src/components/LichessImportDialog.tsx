import { useState, useEffect, useRef } from 'react';
import type { LichessGameSummary } from '../chess/lichessImport';
import { fetchLichessGames, parsePgn } from '../chess/lichessImport';

interface LichessImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the parsed moves when the user picks a game. */
  onSelect: (game: { moves: string[]; headers: Record<string, string> }) => void;
}

export function LichessImportDialog({ open, onClose, onSelect }: LichessImportDialogProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<LichessGameSummary[]>([]);
  // Persist the most-recent successful username so the user doesn't
  // have to retype it next time.
  const LS_KEY = 'chess-analyzer.lichess.lastUser';
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setUsername(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setGames([]);
      setLoading(false);
      // Focus the input on open
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doFetch = async () => {
    const u = username.trim();
    if (!u) {
      setError('Enter a Lichess username.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLichessGames(u, 25);
      if (result.length === 0) {
        setError(`No games found for "${u}".`);
      }
      setGames(result);
      try {
        localStorage.setItem(LS_KEY, u);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError((err as Error).message);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="promotion-backdrop" onClick={onClose}>
      <div
        className="promotion-dialog lichess-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Import from Lichess</h2>
        <div className="lichess-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Lichess username (e.g. DrNykterstein)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doFetch();
            }}
            disabled={loading}
            className="lichess-username"
          />
          <button
            className="primary-action"
            onClick={() => void doFetch()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Fetch games'}
          </button>
        </div>
        {error && <div className="lichess-error">{error}</div>}
        {games.length > 0 && (
          <div className="lichess-games">
            <div className="lichess-games-header">
              {games.length} recent game{games.length === 1 ? '' : 's'}
            </div>
            <div className="lichess-games-list">
              {games.map((g) => {
                const { moves } = parsePgn(g.pgn);
                return (
                  <button
                    key={g.id}
                    className="lichess-game-row"
                    onClick={() => {
                      const parsed = parsePgn(g.pgn);
                      onSelect({
                        moves: parsed.moves,
                        headers: {
                          White: g.white,
                          Black: g.black,
                          Result: g.result,
                          Date: g.date,
                          Opening: g.opening,
                          Event: g.speed,
                        },
                      });
                      onClose();
                    }}
                  >
                    <div className="lichess-game-line1">
                      <span className="lichess-players">
                        {g.white}
                        {g.whiteRating && <span className="lichess-rating"> ({g.whiteRating})</span>}
                        {' vs '}
                        {g.black}
                        {g.blackRating && <span className="lichess-rating"> ({g.blackRating})</span>}
                      </span>
                      <span className={`lichess-result lichess-${g.result.replace('/', '-').replace('*', 'star')}`}>
                        {g.result}
                      </span>
                    </div>
                    <div className="lichess-game-line2">
                      <span>{g.opening || 'Unknown opening'}</span>
                      <span className="lichess-meta">
                        {g.date} · {moves.length} plies · {g.speed}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="lichess-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
