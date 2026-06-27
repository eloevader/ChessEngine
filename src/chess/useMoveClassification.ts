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
import {
  classifyMove,
  isBookMove,
  type ClassifiedMove,
  type ClassifiedPly,
  type MoveEval,
  type MoveTag,
} from './classifier';
import {
  loadBook,
  lookupBook,
} from './openingBook';
import { Chess } from 'chess.js';
import type { EngineLine } from '../engine/StockfishEngine';

interface UseMoveClassificationOptions {
  history: string[];
  evaluate: (
    fen: string,
    multiPv?: number,
  ) => Promise<{
    bestMove: string;
    scoreCp: number | null;
    scoreMate: number | null;
    lines?: EngineLine[];
  }>;
  viewPly: number;
  enabled: boolean;
  /** When true (review mode), evaluate all plies up front so the
   *  user can navigate instantly. When false (analysis), evaluate
   *  lazily as the user navigates. */
  bulk: boolean;
  /** Number of best lines to request from Stockfish (1, 2, or 3). */
  lineCount: number;
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
  /** Per-ply principal variations (top N lines from Stockfish).
   *  Used to draw analysis arrows on the board. */
  linesByPly: Map<number, EngineLine[]>;
} {
  const { history, evaluate, viewPly, enabled, bulk, lineCount, onPlyEvaluated } = opts;

  // Per-ply raw eval cache.
  const [evalCache, setEvalCache] = useState<Map<number, MoveEval>>(new Map());
  const evalCacheRef = useRef<Map<number, MoveEval>>(evalCache);
  evalCacheRef.current = evalCache;
  // Set of plies whose evaluation has completed (so we can show
  // their tag in the move list). A ply is "ready" once both the
  // BEFORE and AFTER positions have been evaluated.
  const [ready, setReady] = useState<Set<number>>(new Set());
  // Per-ply opening-book cache. The book is loaded once at the
  // start of the session; we look up each ply's FEN locally.
  const [bookCache, setBookCache] = useState<Map<number, string | null>>(
    new Map(),
  );
  // Per-ply principal variations (top N lines from Stockfish).
  const [linesByPly, setLinesByPly] = useState<Map<number, EngineLine[]>>(
    new Map(),
  );
  const bookCacheRef = useRef<Map<number, string | null>>(bookCache);
  bookCacheRef.current = bookCache;
  // The raw book (FEN → name) loaded from the JSON file.
  const [book, setBook] = useState<Map<string, string> | null>(null);
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
    setBookCache(new Map());
    setLinesByPly(new Map());
    setOpeningName(null);
    setEvaluatedPlies(0);
  }, [history.length === 0]);

  // Eagerly load the opening book on mount. The book is ~875KB so
  // loading it once here (and on enabled=true) means the lazy /
  // bulk paths can look up positions synchronously.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadBook().then((b) => {
      if (cancelled) return;
      setBook(b);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // FENs at each ply (the position AFTER move ply N). We replay
  // the SAN history from the initial position to compute the FEN
  // for every ply.
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

  // Update the displayed opening name whenever the user navigates
  // and the book is loaded. The bulk and lazy paths also do this,
  // but having a dedicated effect makes sure the name is always
  // current even when the eval cache hasn't changed.
  useEffect(() => {
    if (!book || viewPly <= 0 || viewPly > history.length) {
      setOpeningName(null);
      return;
    }
    const fen = fensAtPly[viewPly];
    if (!fen) return;
    setOpeningName(lookupBook(book, fen));
  }, [book, viewPly, history.length, fensAtPly]);

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
          const { bestMove, scoreCp, lines } = await evaluate(fen, lineCount);
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
          // Persist the principal variations for this ply.
          if (lines && lines.length > 0) {
            setLinesByPly((prev) => {
              const next = new Map(prev);
              next.set(ply, lines);
              return next;
            });
          }
          // Look up the opening name from the local book. If the
          // book hasn't loaded yet, we kick off the load here.
          const lookupName = (b: Map<string, string> | null) => {
            if (!b) return null;
            return lookupBook(b, fen);
          };
          let name = lookupName(book);
          if (name === null && !book) {
            // Book not loaded yet — load it now (will be cached for
            // subsequent calls).
            loadBook().then((b) => {
              if (cancelled) return;
              setBook(b);
              const n = lookupBook(b, fen);
              if (n !== null) {
                setBookCache((prev) => {
                  const next = new Map(prev);
                  next.set(ply, n);
                  return next;
                });
                if (ply === viewPly) setOpeningName(n);
              }
            });
          } else if (name !== null) {
            setBookCache((prev) => {
              const next = new Map(prev);
              next.set(ply, name);
              return next;
            });
            if (ply === viewPly) setOpeningName(name);
          }
          // Persist the principal variations for this ply.
          if (lines && lines.length > 0) {
            setLinesByPly((prev) => {
              const next = new Map(prev);
              next.set(ply, lines);
              return next;
            });
          }
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
        const needBook = !bookCacheRef.current.has(ply);
        if (!needEngine && !needBook) continue;
        const fen = fensAtPly[ply];
        if (!fen) continue;
        const tasks: Array<Promise<void>> = [];
        if (needEngine) {
          setLoading(true);
          tasks.push(
            (async () => {
              try {
                const { bestMove, scoreCp, lines } = await evaluate(fen, lineCount);
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
                // Persist the principal variations for this ply.
                if (lines && lines.length > 0) {
                  setLinesByPly((prev) => {
                    const next = new Map(prev);
                    next.set(ply, lines);
                    return next;
                  });
                }
                onPlyEvaluated?.(ply);
              } catch {
                /* ignore */
              }
            })(),
          );
        }
        if (needBook) {
          tasks.push(
            (async () => {
              try {
                const b = book ?? (await loadBook());
                if (cancelled) return;
                setBook(b);
                const name = lookupBook(b, fen);
                if (name !== null) {
                  setBookCache((prev) => {
                    const next = new Map(prev);
                    next.set(ply, name);
                    return next;
                  });
                  if (ply === viewPly) setOpeningName(name);
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
      // Opening name from the local book (looked up by the FEN of
      // the position AFTER the move). We only consider a move a
      // "book" move within the first 25 plies of the game — after
      // that, the position may still exist in the book DB (the
      // book contains lots of mid-game positions that happen to be
      // popular), but calling them "book" is misleading.
      const bookName = ply <= 25 ? bookCache.get(ply) : null;
      const hardcodedBook = ply <= 25 ? isBookMove(history.slice(0, ply)) : { inBook: false, opening: null };
      const inBook = bookName != null || hardcodedBook.inBook;
      const bookOpening = bookName ?? hardcodedBook.opening ?? null;
      const book = { inBook, opening: bookOpening };
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
  }, [history, fensAtPly, evalCache, ready, bookCache]);

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
    linesByPly,
  };
}

