// Hook that maintains a cache of per-position engine evaluations for
// the current game. Used by the move-classifier UI to show brilliant/
// great/best/good/inaccuracy/mistake/blunder tags for each move.
//
// In addition, the hook fetches the Lichess opening explorer entry
// for each historical position to:
//   - determine whether each move is "book" (appears in the
//     explorer's top moves for the parent position)
//   - look up the opening name (Italian, Najdorf, etc.) for the
//     current position

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
  /** A function the hook can call to ask the engine to evaluate a
   *  position. */
  evaluate: (
    fen: string,
  ) => Promise<{ bestMove: string; scoreCp: number | null; scoreMate: number | null }>;
  /** Ply the user is currently viewing. */
  viewPly: number;
  /** Set to false to disable the cache (e.g. when not in analysis). */
  enabled: boolean;
}

export function useMoveClassification(opts: UseMoveClassificationOptions): {
  classifications: ClassifiedPly[];
  summary: Record<MoveTag, number>;
  loading: boolean;
  /** Opening name for the current position, if any. */
  openingName: string | null;
} {
  const { history, evaluate, viewPly, enabled } = opts;

  // Per-ply raw eval cache.
  const [evalCache, setEvalCache] = useState<Map<number, MoveEval>>(new Map());
  // Mirror of evalCache in a ref so the async loop can read the
  // latest cached plies without re-running on every cache update.
  const evalCacheRef = useRef<Map<number, MoveEval>>(evalCache);
  evalCacheRef.current = evalCache;
  // Set of plies whose evaluation has completed (so we can show
  // their tag in the move list). A ply is "ready" once both the
  // BEFORE and AFTER positions have been evaluated.
  const [ready, setReady] = useState<Set<number>>(new Set());
  // Per-ply Lichess explorer cache. We consult this to decide
  // whether a move is "book" and to look up opening names.
  const [explorerCache, setExplorerCache] = useState<Map<number, ExplorerResponse | null>>(
    new Map(),
  );
  const explorerCacheRef = useRef<Map<number, ExplorerResponse | null>>(explorerCache);
  explorerCacheRef.current = explorerCache;
  // Opening name for the current position (derived from the
  // explorer entry at viewPly).
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset the cache when the history changes.
  useEffect(() => {
    setEvalCache(new Map());
    setReady(new Set());
    setExplorerCache(new Map());
    setOpeningName(null);
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

  // Evaluate the engine for plies [0..viewPly] sequentially, and
  // fetch the opening-explorer entry for each ply too. Both happen
  // in parallel (we don't await one before starting the other).
  useEffect(() => {
    if (!enabled) return;
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
      // Check if this move is in the explorer for the parent position
      // (ply - 1).
      const explorer = explorerCache.get(ply - 1);
      const inExplorer = isInExplorer(explorer ?? null, san);
      // Book = either the local hard-coded book list, OR the move
      // is in the Lichess opening explorer DB. We only mark book
      // when the position itself is still in book (i.e. we're
      // inside a known opening line, not just any move that
      // happens to be popular in the explorer's top moves for an
      // out-of-book position).
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

  return { classifications, summary, loading, openingName };
}
