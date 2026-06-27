import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StockfishEngine, THINK_TIME_MS, type EngineLine } from './StockfishEngine';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

export interface UseEngineReturn {
  status: EngineStatus;
  error: string | null;
  bestLine: EngineLine | null;
  allLines: EngineLine[];
  scoreCp: number | null;
  scoreMate: number | null;
  bestMove: string | null;
  requestEval: (
    fen: string,
    level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    thinkTime?: 'instant' | 'fast' | 'normal' | 'slow' | 'maximum',
  ) => void;
  /** One-shot evaluation of an arbitrary FEN. When `multiPv` is
   *  greater than 1, the returned `lines` contains the top N
   *  principal variations from Stockfish. */
  evalPosition: (
    fen: string,
    multiPv?: number,
  ) => Promise<{
    bestMove: string;
    scoreCp: number | null;
    scoreMate: number | null;
    lines?: import('./StockfishEngine').EngineLine[];
  }>;
  stop: () => void;
  clearBestMove: () => void;
}

export function useEngine(): UseEngineReturn {
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [bestLine, setBestLine] = useState<EngineLine | null>(null);
  const [allLines, setAllLines] = useState<EngineLine[]>([]);
  const [scoreCp, setScoreCp] = useState<number | null>(null);
  const [scoreMate, setScoreMate] = useState<number | null>(null);
  const [bestMove, setBestMove] = useState<string | null>(null);

  const engineRef = useRef<StockfishEngine | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const eng = new StockfishEngine('ws://localhost:8765');
    engineRef.current = eng;
    const off = eng.onMessage((msg) => {
      if (msg.type === 'status') {
        if (msg.status === 'connecting') {
          setStatus('loading');
        } else if (msg.status === 'connected') {
          // Wait for readyok
        } else if (msg.status === 'disconnected') {
          setStatus('loading');
        }
      } else if (msg.type === 'ready') {
        setStatus('ready');
        setError(null);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
      } else if (msg.type === 'info') {
        const pv1 = msg.lines.find((l) => l.multipv === 1) ?? msg.lines[0];
        setAllLines(msg.lines);
        if (pv1) {
          setBestLine(pv1);
          if (pv1.scoreMate !== null) {
            setScoreMate(pv1.scoreMate);
            setScoreCp(null);
          } else {
            setScoreCp(pv1.scoreCp);
            setScoreMate(null);
          }
        }
        setStatus('thinking');
      } else if (msg.type === 'bestmove') {
        setStatus('ready');
        setBestMove(msg.move);
      }
    });
    // Start init
    eng.init().catch((err) => {
      setError((err as Error).message);
      setStatus('error');
    });
    return () => {
      off();
      eng.destroy();
    };
  }, []);

  const startEngineEval = useCallback(
    async (
      fen: string,
      level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
      thinkTime: 'instant' | 'fast' | 'normal' | 'slow' | 'maximum' | undefined,
      multiPv: number = 1,
    ) => {
      const e = engineRef.current;
      if (!e) return;
      try {
        await e.setPosition(fen);
        setStatus('thinking');
        const movetimeOverride =
          thinkTime != null ? THINK_TIME_MS[thinkTime] : undefined;
        await e.go({
          level,
          multiPv,
          ...(movetimeOverride != null ? { movetimeOverride } : {}),
        });
      } catch {
        // ignored; the engine emits its own error events
      }
    },
    [],
  );

  const requestEval = useCallback(
    (
      fen: string,
      level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
      thinkTime?: 'instant' | 'fast' | 'normal' | 'slow' | 'maximum',
      multiPv: number = 1,
    ) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void startEngineEval(fen, level, thinkTime, multiPv);
      }, 150) as unknown as number;
    },
    [startEngineEval],
  );

  const evalPosition = useCallback(
    (fen: string, multiPv: number = 1) => {
      const e = engineRef.current;
      if (!e) {
        return Promise.resolve({
          bestMove: '',
          scoreCp: null,
          scoreMate: null,
        });
      }
      return e.evalOnce(fen, 250, multiPv);
    },
    [],
  );

  const stop = useCallback(async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (engineRef.current) await engineRef.current.stop();
    setStatus((s) => (s === 'thinking' ? 'ready' : s));
  }, []);

  const clearBestMove = useCallback(() => setBestMove(null), []);

  return useMemo(
    () => ({
      status,
      error,
      bestLine,
      allLines,
      scoreCp,
      scoreMate,
      requestEval,
      evalPosition,
      stop,
      bestMove,
      clearBestMove,
    }),
    [
      status,
      error,
      bestLine,
      allLines,
      scoreCp,
      scoreMate,
      requestEval,
      evalPosition,
      stop,
      bestMove,
      clearBestMove,
    ],
  );
}
