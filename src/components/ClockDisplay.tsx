import { formatClockTime } from '../chess/ChessClock';

interface ClockDisplayProps {
  side: 'w' | 'b';
  seconds: number;
  active: boolean;
  label: string;
}

export function ClockDisplay({ side, seconds, active, label }: ClockDisplayProps) {
  return (
    <div
      className={`clock-display ${active ? 'active' : ''} clock-${side}`}
    >
      <span className="clock-label">{label}</span>
      <span className="clock-time">{formatClockTime(seconds)}</span>
    </div>
  );
}
