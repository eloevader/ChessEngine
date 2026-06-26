// Hook that maintains a cache of per-position engine evaluations for
// the current game. Used by the move-classifier UI to show brilliant/
// great/best/good/inaccuracy/mistake/blunder tags for each move.
//
// In addition, the hook fetches the Lichess opening explorer entry
// for each historical position to:
//   - determine whether each move is "book" (appears in the
//     explorer's top moves for the parent position)
//   - look up the opening name (Italian, Najdorf, etc.) for the
//     current position.
//
// We have two modes:
//   1. Lazy (analysis / live review): when the user views ply N, we
//      evaluate plies 0..N sequentially. The user can navigate while
//      it loads; the move tags appear as each ply's eval completes.
//   2. Bulk (review mode): on entry, evaluate ALL plies 0..N at once
//      in the background. A "calculating" indicator shows progress.
//      Once the bulk pass is done, navigation is instant (everything
//      is cached).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  classifyMove,
  isBookMove,
  type ClassifiedMove,
  type ClassifiedPly,
  type MoveEval,
  type MoveTag,
} from './classifier';
import {
  fetchExplorer,
  isInExplorer,
  type ExplorerResponse,
} from './lichessExplorer';

interface UseMoveClassificationOptions {
  history: string[];
  evaluate: (
    fen: string,
  ) => Promise<{ bestMove: string; scoreCp: number | null; scoreMate: number | null }>;
  viewPly: number;
  enabled: boolean;
  /** When true (review mode), evaluate all plies up front so the
   *  user can navigate instantly. When false (analysis), evaluate
   *  lazily as the user navigates. */
  bulk: boolean;
  /** Called whenever a single ply's eval completes (so the caller
   *  can persist it or trigger a re-render). */
  onPlyEvaluated?: (ply: number) => void;
}

export function useMoveClassification(opts: UseMoveClassificationOptions): {
  classifications: ClassifiedPly[];
  summary: Record<MoveTag, number>;
  loading: boolean;
  /** True when the bulk pre-pass is in progress (review mode). */
  bulkLoading: boolean;
  /** Number of plies whose eval has completed (0..history.length). */
  evaluatedPlies: number;
  /** Total plies that need to be evaluated. */
  totalPlies: number;
  /** Opening name for the current position, if any. */
  openingName: string | null;
} {
  const { history, evaluate, viewPly, enabled, bulk, onPlyEvaluated } = opts;

  // Per-ply raw eval cache.
  const [evalCache, setEvalCache] = useState<Map<number, MoveEval>>(new Map());
  const evalCacheRef = useRef<Map<number, MoveEval>>(evalCache);
  evalCacheRef.current = evalCache;
  // Set of plies whose evaluation has completed (so we can show
  // their tag in the move list). A ply is "ready" once both the
  // BEFORE and AFTER positions have been evaluated.
  const [ready, setReady] = useState<Set<number>>(new Set());
  // Per-ply Lichess explorer cache.
  const [explorerCache, setExplorerCache] = useState<Map<number, ExplorerResponse | null>>(
    new Map(),
  );
  const explorerCacheRef = useRef<Map<number, ExplorerResponse | null>>(explorerCache);
  explorerCacheRef.current = explorerCache;
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [evaluatedPlies, setEvaluatedPlies] = useState(0);
  // Total plies the bulk pass needs to cover. We track this in a
  // ref so the bulk effect can compare against it.
  const totalPlies = history.length;

  // Reset caches when the history changes.
  useEffect(() => {
    setEvalCache(new Map());
    setReady(new Set());
    setExplorerCache(new Map());
    setOpeningName(null);
    setEvaluatedPlies(0);
  }, [history.length === 0]);

  // FENs at each ply.
  const fensAtPly = useMemo(() => {
    const fens: string[] = [];
    const c = new Chess();
    fens.push(c.fen());
    for (let i = 0; i < history.length; i++) {
      try {
        c.move(history[i]);
        fens.push(c.fen());
      } catch {
        break;
      }
    }
    return fens;
  }, [history]);

  // -------- Bulk pre-pass (review mode) --------
  // When `bulk` is true, evaluate plies 0..history.length
  // sequentially as soon as enabled, so navigation is instant.
  useEffect(() => {
    if (!enabled || !bulk) return;
    if (history.length === 0) return;
    // Skip if everything is already cached.
    const needsWork = (() => {
      for (let p = 0; p <= history.length; p++) {
        if (!evalCacheRef.current.has(p)) return true;
      }
      return false;
    })();
    if (!needsWork) {
      setBulkLoading(false);
      setEvaluatedPlies(history.length);
      return;
    }
    let cancelled = false;
    setBulkLoading(true);
    setEvaluatedPlies(0);
    (async () => {
      for (let ply = 0; ply <= history.length; ply++) {
        if (cancelled) return;
        if (evalCacheRef.current.has(ply)) {
          setEvaluatedPlies((n) => n + 1);
          continue;
        }
        const fen = fensAtPly[ply];
        if (!fen) continue;
        setLoading(true);
        try {
          const { bestMove, scoreCp } = await evaluate(fen);
          if (cancelled) return;
          setEvalCache((prev) => {
            const next = new Map(prev);
            next.set(ply, {
              cpAfter: scoreCp ?? 0,
              cpBefore: 0,
              bestMove,
              bestCp: scoreCp,
              wasOnlyGoodMove: false,
            });
            setReady((prevReady) => {
              const nextReady = new Set(prevReady);
              for (let p = 1; p <= history.length; p++) {
                if (!nextReady.has(p) && next.has(p - 1) && next.has(p)) {
                  nextReady.add(p);
                }
              }
              return nextReady;
            });
            return next;
          });
          // Also fetch the explorer for this ply (best-effort, in
          // parallel — we don't await it before continuing).
          void fetchExplorer(fen, 12).then((res) => {
            if (cancelled) return;
            setExplorerCache((prev) => {
              const next = new Map(prev);
              next.set(ply, res);
              return next;
            });
            if (ply === viewPly && res?.opening?.name) {
              setOpeningName(res.opening.name);
            }
          });
          setEvaluatedPlies((n) => n + 1);
          onPlyEvaluated?.(ply);
        } catch {
          /* ignore */
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      if (!cancelled) {
        setBulkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, bulk, history.length]);

  // -------- Lazy mode (analysis / live review) --------
  // When bulk is false, evaluate plies 0..viewPly on demand as
  // the user navigates.
  useEffect(() => {
    if (!enabled || bulk) return;
    if (viewPly < 0) return;
    if (viewPly > history.length) return;
    let cancelled = false;
    const ensureAll = async () => {
      for (let ply = 0; ply <= viewPly; ply++) {
        if (cancelled) return;
        const needEngine = !evalCacheRef.current.has(ply);
        const needExplorer = !explorerCacheRef.current.has(ply);
        if (!needEngine && !needExplorer) continue;
        const fen = fensAtPly[ply];
        if (!fen) continue;
        const tasks: Array<Promise<void>> = [];
        if (needEngine) {
          setLoading(true);
          tasks.push(
            (async () => {
              try {
                const { bestMove, scoreCp } = await evaluate(fen);
                if (cancelled) return;
                setEvalCache((prev) => {
                  const next = new Map(prev);
                  next.set(ply, {
                    cpAfter: scoreCp ?? 0,
                    cpBefore: 0,
                    bestMove,
                    bestCp: scoreCp,
                    wasOnlyGoodMove: false,
                  });
                  setReady((prevReady) => {
                    const nextReady = new Set(prevReady);
                    for (let p = 1; p <= history.length; p++) {
                      if (!nextReady.has(p) && next.has(p - 1) && next.has(p)) {
                        nextReady.add(p);
                      }
                    }
                    return nextReady;
                  });
                  return next;
                });
                onPlyEvaluated?.(ply);
              } catch {
                /* ignore */
              }
            })(),
          );
        }
        if (needExplorer) {
          tasks.push(
            (async () => {
              try {
                const res = await fetchExplorer(fen, 12);
                if (cancelled) return;
                setExplorerCache((prev) => {
                  const next = new Map(prev);
                  next.set(ply, res);
                  return next;
                });
                if (ply === viewPly && res?.opening?.name) {
                  setOpeningName(res.opening.name);
                }
              } catch {
                /* ignore */
              }
            })(),
          );
        }
        await Promise.all(tasks);
        if (!cancelled) setLoading(false);
      }
    };
    void ensureAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, enabled, history.length]);

  // Compute the per-ply classifications.
  const classifications = useMemo<ClassifiedPly[]>(() => {
    const out: ClassifiedPly[] = [];
    for (let ply = 1; ply <= history.length; ply++) {
      const fen = fensAtPly[ply];
      const beforeEval = evalCache.get(ply - 1);
      const afterEval = evalCache.get(ply);
      const san = history[ply - 1];
      const wasCheck = san.includes('+');
      const isMating = san.includes('#');
      const plyReady = ready.has(ply);
      const explorer = explorerCache.get(ply - 1);
      const inExplorer = isInExplorer(explorer ?? null, san);
      const hardcodedBook = isBookMove(history.slice(0, ply));
      const explorerBook = inExplorer && explorer?.opening != null;
      const book = {
        inBook: hardcodedBook.inBook || explorerBook,
        opening:
          hardcodedBook.opening ?? explorer?.opening?.name ?? null,
      };
      let classification: ClassifiedMove;
      if (!plyReady) {
        classification = { tag: '?', score: 0, description: '' };
      } else if (book.inBook) {
        classification = {
          tag: 'book',
          score: 2.5,
          description: `Book — ${book.opening ?? 'known opening'}`,
        };
      } else if (afterEval && beforeEval) {
        classification = classifyMove({
          evalBefore: beforeEval.cpAfter,
          evalAfter: afterEval.cpAfter,
          bestMove: beforeEval.bestMove,
          bestCpAtBest: beforeEval.bestCp,
          wasOnlyGoodMove: afterEval.wasOnlyGoodMove,
          wasCheck,
          movedPieceValue: 0,
          isMating,
        });
      } else {
        classification = { tag: '?', score: 0, description: 'Analyzing…' };
      }
      out.push({
        ply,
        san,
        fen: fen ?? '',
        eval: afterEval ?? null,
        classification,
        book,
        isCheck: wasCheck,
        isMating,
      });
    }
    return out;
  }, [history, fensAtPly, evalCache, ready, explorerCache]);

  const summary = useMemo(() => {
    const acc: Record<MoveTag, number> = {
      '?': 0,
      book: 0,
      brilliant: 0,
      great: 0,
      best: 0,
      good: 0,
      neutral: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
    for (const c of classifications) acc[c.classification.tag]++;
    return acc;
  }, [classifications]);

  return {
    classifications,
    summary,
    loading,
    bulkLoading,
    evaluatedPlies,
    totalPlies,
    openingName,
  };
}
