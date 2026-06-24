import type { Piece } from '../chess/types';
import { pieceImageUrl } from '../chess/pieces';
import { useSettings } from '../settings/SettingsStore';

const PIECE_VALUES: Record<Piece['type'], number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

interface CapturedRowProps {
  captures: { white: Piece[]; black: Piece[] };
  side: 'w' | 'b';
}

export function CapturedRow({ captures, side }: CapturedRowProps) {
  const [settings] = useSettings();

  // side is the player at the BOTTOM of the board. The bottom row shows
  // pieces captured BY that player (i.e. opponent's pieces they've taken).
  const myCaptures = side === 'w' ? captures.black : captures.white;
  const myValue = myCaptures.reduce((s, p) => s + PIECE_VALUES[p.type], 0);

  const oppCaptures = side === 'w' ? captures.white : captures.black;
  const oppValue = oppCaptures.reduce((s, p) => s + PIECE_VALUES[p.type], 0);
  const diff = myValue - oppValue;

  if (myCaptures.length === 0) {
    return <div className="captured-row empty">&nbsp;</div>;
  }

  return (
    <div className="captured-row">
      <div className="captured-line">
        {myCaptures
          .slice()
          .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type])
          .map((p, i) => (
            <img
              key={i}
              className="captured-piece"
              src={pieceImageUrl(settings.pieceSet, p.color, p.type)}
              alt={`${p.color} ${p.type}`}
            />
          ))}
        {diff > 0 && <span className="material-diff">+{diff}</span>}
      </div>
    </div>
  );
}
