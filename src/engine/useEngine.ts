import { useEffect, useRef, useState } from 'react';
import { StockfishEngine, type EngineLine, type EngineMessage } from './StockfishEngine';
import { fetchLichessEval } from './lichessCloud';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

export interface UseEngineReturn {
  status: EngineStatus;
  error: string | null;
  bestLine: EngineLine | null;
  allLines: EngineLine[];
  /** Score from the latest evaluation (cp or mate). */
  scoreCp: number | null;
  scoreMate: number | null;
  /** Request the engine to think about a position. */
  requestEval: (fen: string, level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
  /** Stop any in-progress evaluation. */
  stop: () => void;
  /** Whether the user is currently playing against the engine. */
  bestMove: string | null;
  clearBestMove: () => void;
}

export function useEngine(): UseEngineReturn {
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [bestLine, setBestLine] = useState<EngineLine | null>(null);
  const [allLines, setAllLines] = useState<EngineLine[]>([]);
  const [scoreCp, setScoreCp] = useState<number | null>(null);
  const [scoreMate, setScoreMate] = useState<number | null>(null);
  const [bestMove, setBestMove] = useState<string | null>(null);

  const engineRef = useRef<StockfishEngine | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const engineAtMount = engineRef;
    const debounceAtMount = debounceRef;
    return () => {
      engineAtMount.current?.destroy();
      if (debounceAtMount.current) window.clearTimeout(debounceAtMount.current);
    };
  }, []);

  // Safety timeout: if the engine doesn't respond within 15 seconds, clear
  // the bestMove so the UI doesn't get stuck waiting.
  useEffect(() => {
    if (!bestMove) return;
    const t = setTimeout(() => {
      // If bestMove is still set after 15s, something went wrong; clear it
      setBestMove(null);
    }, 15000);
    return () => clearTimeout(t);
  }, [bestMove]);

  const ensureEngine = async (): Promise<StockfishEngine> => {
    if (engineRef.current) return engineRef.current;
    setStatus('loading');
    const e = new StockfishEngine();
    e.onMessage((msg) => handleEngineMessage(msg, e));
    try {
      await e.init();
      setStatus('ready');
      return e;
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
      throw err;
    }
  };

  const handleEngineMessage = (msg: EngineMessage, _e: StockfishEngine) => {
    if (msg.type === 'ready') {
      setStatus('ready');
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
  };

  const requestEval = (fen: string, level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      // Try Lichess cloud first for instant results
      try {
        const cloud = await fetchLichessEval(fen);
        if (cloud && cloud.pvs && cloud.pvs.length > 0) {
          const pv = cloud.pvs[0];
          const pvMoves = pv.moves.split(' ').filter(Boolean);
          setBestLine({
            multipv: 1,
            depth: cloud.depth,
            seldepth: cloud.depth,
            scoreCp: pv.cp,
            scoreMate: pv.mate,
            pv: pvMoves,
            nps: 0,
            timeMs: 0,
            nodes: cloud.knodes * 1000,
          });
          if (pv.mate !== null) {
            setScoreMate(pv.mate);
            setScoreCp(null);
          } else {
            setScoreCp(pv.cp);
            setScoreMate(null);
          }
          // If we got a move from the cloud, also set it as the best move
          // so the computer can play immediately without waiting for Stockfish
          if (pvMoves.length > 0) {
            setBestMove(pvMoves[0]);
          }
          // Also start Stockfish for deeper analysis
          void startEngineEval(fen, level);
          return;
        }
      } catch {
        /* cloud failed, fall through to Stockfish */
      }
      void startEngineEval(fen, level);
    }, 200) as unknown as number;
  };

  const startEngineEval = async (fen: string, level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => {
    try {
      const e = await ensureEngine();
      await e.setPosition(fen);
      setStatus('thinking');
      await e.go({ level });
    } catch {
      /* already handled in ensureEngine */
    }
  };

  const stop = async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (engineRef.current) await engineRef.current.stop();
    setStatus('ready');
  };

  const clearBestMove = () => setBestMove(null);

  return {
    status,
    error,
    bestLine,
    allLines,
    scoreCp,
    scoreMate,
    requestEval,
    stop,
    bestMove,
    clearBestMove,
  };
}
