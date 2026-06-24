import { useEffect, useRef, useState } from 'react';

export interface ClockConfig {
  /** Total starting time per side in seconds. */
  initialSeconds: number;
  /** Increment in seconds added after each move. */
  incrementSeconds: number;
}

export interface ChessClock {
  whiteSeconds: number;
  blackSeconds: number;
  /** Whose clock is currently running. null if paused / game over. */
  running: 'w' | 'b' | null;
  /** Who ran out of time, if any. */
  winner: 'w' | 'b' | null;
  isOver: boolean;
  /** Start a new game with the given config. */
  reset: (cfg: ClockConfig) => void;
  /** Switch which clock is running. Typically called after a move is played. */
  switchTo: (side: 'w' | 'b' | null) => void;
  /** Add the increment to the side that just moved. */
  addIncrement: (side: 'w' | 'b') => void;
}

export function useChessClock(initial?: ClockConfig): ChessClock {
  const [whiteSeconds, setWhite] = useState(initial?.initialSeconds ?? 0);
  const [blackSeconds, setBlack] = useState(initial?.initialSeconds ?? 0);
  const [running, setRunning] = useState<'w' | 'b' | null>(null);
  const [winner, setWinner] = useState<'w' | 'b' | null>(null);
  const initialRef = useRef(initial);

  const reset = (cfg: ClockConfig) => {
    initialRef.current = cfg;
    setWhite(cfg.initialSeconds);
    setBlack(cfg.initialSeconds);
    setRunning(null);
    setWinner(null);
  };

  const switchTo = (side: 'w' | 'b' | null) => {
    setRunning(side);
  };

  const addIncrement = (side: 'w' | 'b') => {
    if (!initialRef.current) return;
    if (side === 'w') {
      setWhite((s) => s + initialRef.current!.incrementSeconds);
    } else {
      setBlack((s) => s + initialRef.current!.incrementSeconds);
    }
  };

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (running === 'w') {
        setWhite((s) => {
          if (s <= 0) {
            setWinner('b');
            setRunning(null);
            return 0;
          }
          return s - 0.1;
        });
      } else {
        setBlack((s) => {
          if (s <= 0) {
            setWinner('w');
            setRunning(null);
            return 0;
          }
          return s - 0.1;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [running]);

  return {
    whiteSeconds,
    blackSeconds,
    running,
    winner,
    isOver: winner !== null,
    reset,
    switchTo,
    addIncrement,
  };
}

export function formatClockTime(seconds: number): string {
  if (seconds <= 0) return '0:00.0';
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const tenths = Math.floor((total - Math.floor(total)) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}
