// Compact list of active threat descriptions ("White Rook on b4
// attacks Black Pawn on b5"). Rendered inside the side panel
// under the move list so the board area never shifts when threats
// change.

import type { AttackDescription } from '../chess/threats';

const PIECE_DISPLAY: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

interface ThreatsPanelProps {
  descriptions: AttackDescription[];
}

export function ThreatsPanel({ descriptions }: ThreatsPanelProps) {
  if (descriptions.length === 0) return null;
  return (
    <div className="threats-panel">
      <div className="threats-header">
        Active threats ({descriptions.length})
      </div>
      <div className="threats-list">
        {descriptions.map((d, i) => {
          const pieceName = PIECE_DISPLAY[d.attackerType] ?? d.attackerType.toUpperCase();
          const targetName = PIECE_DISPLAY[d.targetType] ?? d.targetType.toUpperCase();
          const side = d.attackerColor === 'w' ? 'W' : 'B';
          const opp = d.attackerColor === 'w' ? 'B' : 'W';
          return (
            <div key={i} className="threat-line">
              <span className={`threat-side threat-side-${d.attackerColor}`}>{side}</span>
              <span className="threat-piece">{pieceName}</span>
              <span className="threat-square">{d.attackerSquare}</span>
              <span className="threat-arrow">→</span>
              <span className={`threat-target threat-target-${d.attackerColor === 'w' ? 'b' : 'w'}`}>{opp}</span>
              <span className="threat-piece">{targetName}</span>
              <span className="threat-square">{d.targetSquare}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
