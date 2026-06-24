import type { PieceColor } from '../chess/types';
import { pieceImageUrl } from '../chess/pieces';
import { getSettings } from '../settings/SettingsStore';

interface PromotionDialogProps {
  color: PieceColor;
  onChoose: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const PIECES: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n'];

export function PromotionDialog({ color, onChoose, onCancel }: PromotionDialogProps) {
  const settings = getSettings();
  return (
    <div className="promotion-backdrop" onClick={onCancel}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Promote pawn</h3>
        <div className="promotion-choices">
          {PIECES.map((p) => (
            <button
              key={p}
              className="promotion-btn"
              onClick={() => onChoose(p)}
              aria-label={`Promote to ${p}`}
            >
              <img
                className="promotion-piece"
                src={pieceImageUrl(settings.pieceSet, color, p)}
                alt={p}
              />
              <span className="promotion-label">{p.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
