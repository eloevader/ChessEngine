import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { MoveHistory } from './components/MoveHistory';
import { PromotionDialog } from './components/PromotionDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { CapturedRow } from './components/CapturedPieces';
import { EvalBar } from './components/EvalBar';
import { ClockDisplay } from './components/ClockDisplay';
import { NewGameDialog } from './components/NewGameDialog';
import { LichessImportDialog } from './components/LichessImportDialog';
import { GameState, type LegalMove } from './chess/GameState';
import type { Piece, Square } from './chess/types';
import {
  useSettings,
  ANIMATION_DURATIONS_MS,
  setCommittedSettings,
} from './settings/SettingsStore';
import type {
  GameMode,
  PlayerSide,
  EngineLevel,
} from './settings/SettingsStore';
import { useSound } from './settings/SoundManager';
import { getTheme, themeToCss } from './chess/themes';
import { useEngine } from './engine/useEngine';
import { useChessClock } from './chess/ChessClock';
import { useLiveAttacks, type Arrow, type ArrowColor, type AttackDescription } from './chess/threats';
import { useMoveClassification } from './chess/useMoveClassification';
import type { MoveTag } from './chess/classifier';
import './App.css';

// ---------------- Types ----------------

const PIECE_DISPLAY: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

type PendingPromotion = {
  from: Square;
  to: Square;
  color: 'w' | 'b';
} | null;

type AnimatingMove = {
  from: Square;
  to: Square;
  piece: Piece;
  isCapture: boolean;
  captured: Piece | null;
} | null;

interface GameConfig {
  mode: GameMode;
  level?: EngineLevel;
  side?: PlayerSide;
  timeMin: number;
  timeSec: number;
  increment: number;
}

type GameEndReason =
  | { kind: 'resign'; side: 'w' | 'b' }
  | { kind: 'draw' }
  | null;

// ---------------- Pure helpers ----------------

const game = new GameState();
const INITIAL_FEN = game.fen();

function buildBoard(fen: string): (Piece | null)[][] {
  const placement = fen.split(' ')[0];
  const rows = placement.split('/');
  const board: (Piece | null)[][] = [];
  for (const row of rows) {
    const boardRow: (Piece | null)[] = [];
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        const empty = parseInt(ch, 10);
        for (let i = 0; i < empty; i++) boardRow.push(null);
      } else {
        const color: 'w' | 'b' = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase() as Piece['type'];
        boardRow.push({ type, color });
      }
    }
    board.push(boardRow);
  }
  return board;
}

function findKingSquare(fen: string, color: 'w' | 'b'): Square | null {
  const board = buildBoard(fen);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        return (String.fromCharCode(97 + c) + (8 - r)) as Square;
      }
    }
  }
  return null;
}

function isPlayMode(mode: GameMode): boolean {
  return mode === 'local' || mode === 'computer';
}

function pickEngineSide(playerSide: PlayerSide): 'w' | 'b' {
  if (playerSide === 'w') return 'b';
  if (playerSide === 'b') return 'w';
  return Math.random() < 0.5 ? 'w' : 'b';
}

// ---------------- App ----------------

function App() {
  const settings = useSettings();
  const { emit } = useSound();
  const engine = useEngine();
  const clock = useChessClock();
  // Destructure the bits of the engine we use inside effects so each dep is a
  // stable primitive/callback rather than the whole (memoized) engine object.
  const { requestEval: engineRequestEval, stop: engineStop, bestMove: engineBestMove, clearBestMove: engineClearBestMove } = engine;

  // -------- Local UI state --------
  const [fen, setFen] = useState(game.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<Square>>(new Set());
  const [captureTargets, setCaptureTargets] = useState<Set<Square>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(null);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove>(null);
  const [settingsOpen, setSettingsOpen] = useState(settings.showSettingsOnStart);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [captures, setCaptures] = useState<{ white: Piece[]; black: Piece[] }>({
    white: [],
    black: [],
  });
  const [viewPly, setViewPly] = useState(0);
  const [fullHistory, setFullHistory] = useState<string[]>([]);
  const [engineSide, setEngineSide] = useState<'w' | 'b' | null>(null);
  const [clockEnabled, setClockEnabled] = useState(false);
  const [gameEndReason, setGameEndReason] = useState<GameEndReason>(null);
  const [drawOffer, setDrawOffer] = useState<'w' | 'b' | null>(null);
  /** True after the user clicks "Review" on the post-game prompt. */
  const [reviewing, setReviewing] = useState(false);
  /** User-drawn arrows on the board (chess.com style). */
  const [arrows, setArrows] = useState<Arrow[]>([]);
  /** Single-square color highlights (right-click without drag). */
  const [squareHighlights, setSquareHighlights] = useState<Map<Square, ArrowColor>>(
    new Map(),
  );
  /** Currently selected arrow color for the next right-click drag. */
  const [arrowColor, setArrowColor] = useState<ArrowColor>('green');
  /** Lichess import dialog open/closed. */
  const [lichessOpen, setLichessOpen] = useState(false);
  /** Last imported Lichess game's headers (for display). */
  const [lichessHeaders, setLichessHeaders] = useState<Record<string, string> | null>(null);
  /** Queue of pre-moves (vs-computer mode only). Each move is played
   *  in order as soon as it becomes the human's turn. The user can
   *  queue several moves ahead during the engine's thinking time —
   *  like chess.com / Lichess, each pre-move costs 0.1s off the
   *  human's clock (only when a clock is enabled). */
  const [preMoveQueue, setPreMoveQueue] = useState<
    Array<{ from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }>
  >([]);
  /** The pre-move the user is currently composing (incomplete —
   *  from and to are the same square, waiting for a destination). */
  const [pendingPreMoveFrom, setPendingPreMoveFrom] = useState<Square | null>(
    null,
  );
  const preMove = preMoveQueue[0] ?? null;
  const preMovesEnabled = settings.gameMode === 'computer';
  // Number of pre-moves that have already been queued (excluding the
  // pending one being composed). We display this in the status bar.
  const queuedCount = preMoveQueue.length;

  // -------- Derived state --------
  const snapshot = game.snapshot();
  // Live attack tracker. Per the spec: ONLY the piece that just moved is
  // considered, and only enemy pieces on the attacked squares produce
  // arrows. White's attack on Black → blue; Black's attack on White → red.
  // If a target also attacks the moved piece back, both arrows are drawn
  // (curved, fanning apart).
  const showThreatsNow =
    settings.showThreats &&
    (settings.gameMode === 'analysis' || reviewing);
  // The side that just moved is the opposite of the side to move now.
  const lastMoverColor: 'w' | 'b' | null = lastMove
    ? (snapshot.turn === 'w' ? 'b' : 'w')
    : null;
  const liveAttacks = useLiveAttacks(
    fen,
    showThreatsNow,
    lastMove?.to ?? null,
    settings.threatScope,
    lastMoverColor,
  );
  const threatArrows: Arrow[] = liveAttacks.arrows;
  const attackDescriptions: AttackDescription[] = liveAttacks.descriptions;
  const allArrows = useMemo(() => [...threatArrows, ...arrows], [threatArrows, arrows]);
  const board = useMemo(() => buildBoard(fen), [fen]);

  // Move classification: only enabled in analysis / review. In live
  // play (local or computer) we don't run the classifier so the
  // engine doesn't have to evaluate historical positions.
  // In review mode, run a bulk pre-pass so all moves are evaluated
  // up front; in analysis, evaluate lazily as the user navigates.
  const moveClassifications = useMoveClassification({
    history: fullHistory,
    evaluate: engine.evalPosition,
    viewPly,
    enabled: settings.gameMode === 'analysis' || reviewing,
    bulk: reviewing,
  });

  // Per-square map of move annotations for the move the user is
  // currently viewing. Keyed by the move's destination square (the
  // piece's NEW position — chess.com style).
  const moveTagsByTo = useMemo(() => {
    const out = new Map<Square, { tag: MoveTag; label: string }>();
    if (viewPly <= 0) return out;
    if (viewPly > fullHistory.length) return out;
    const c = moveClassifications.classifications[viewPly - 1];
    if (!c) return out;
    if (c.classification.tag === '?') return out;
    // We need the destination square. The lastMove in App state
    // tracks the most recent move, but if the user has navigated
    // back, lastMove still reflects the latest played move (not
    // the move at viewPly). We need to look up the SAN → UCI
    // conversion via the GameState, or maintain a per-ply map.
    // We can derive it from the game history: replay the moves up
    // to viewPly and find the last one's destination.
    const g = new GameState();
    let lastTo: Square | null = null;
    for (let i = 0; i < viewPly; i++) {
      const r = g.moveSan(fullHistory[i]);
      if (r) lastTo = r.to as Square;
    }
    if (lastTo) {
      out.set(lastTo, {
        tag: c.classification.tag,
        label: c.classification.description,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, fullHistory, moveClassifications.classifications]);

  const kingInCheck = useMemo(
    () => (snapshot.inCheck ? findKingSquare(fen, snapshot.turn) : null),
    [fen, snapshot.inCheck, snapshot.turn],
  );

  // -------- Theme --------
  const theme = getTheme(settings.boardThemeId);
  const effectiveLight = settings.customLight ?? theme.light;
  const effectiveDark = settings.customDark ?? theme.dark;
  useEffect(() => {
    const css = themeToCss(theme);
    css['--light-sq'] = effectiveLight;
    css['--dark-sq'] = effectiveDark;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(css)) root.style.setProperty(k, v);
  }, [theme, effectiveLight, effectiveDark]);

  // -------- Move execution --------
  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const piece = game.pieceAt(from);
      if (!piece) return null;
      // If we're in review mode and the user makes a move from a
      // mid-game position, exit review and resume the game
      // (chess.com-style "Return to game from this move").
      if (reviewing && (snapshot.isGameOver || gameEndReason)) {
        setReviewing(false);
        const replay = fullHistory.slice(0, viewPly);
        game.reset();
        for (const san of replay) {
          try {
            game.moveSan(san);
          } catch {
            break;
          }
        }
      }
      const result = game.move(from, to, promotion);
      if (!result) {
        emit({ type: 'illegal' });
        return null;
      }
      const captured = result.captured
        ? ({ color: result.color === 'w' ? 'b' : 'w', type: result.captured } as Piece)
        : null;
      const anim: AnimatingMove = {
        from: result.from as Square,
        to: result.to as Square,
        piece,
        isCapture: result.isCapture,
        captured,
      };
      setLastMove({ from: result.from as Square, to: result.to as Square });
      setAnimatingMove(anim);
      setFen(game.fen());
      setViewPly((v) => v + 1);
      setFullHistory((h) => [...h, result.san]);

      if (clockEnabled) {
        clock.addIncrement(result.color);
        clock.switchTo(game.turn());
      }

      if (captured) {
        setCaptures((prev) => {
          const key = captured.color === 'w' ? 'white' : 'black';
          return { ...prev, [key]: [...prev[key], captured] };
        });
      }

      if (result.isCapture) emit({ type: 'capture', move: result });
      else emit({ type: 'move', move: result });

      const nextSnap = game.snapshot();
      if (nextSnap.isCheckmate) emit({ type: 'checkmate' });
      else if (nextSnap.isStalemate || nextSnap.isDraw) emit({ type: 'draw' });
      else if (nextSnap.inCheck) emit({ type: 'check' });

      if (settings.flipAfterMove && settings.gameMode !== 'computer') {
        setTimeout(
          () => setOrientation((o) => (o === 'w' ? 'b' : 'w')),
          ANIMATION_DURATIONS_MS[settings.animationSpeed],
        );
      }
      return result;
    },
    [
      clock,
      clockEnabled,
      emit,
      settings.animationSpeed,
      settings.flipAfterMove,
      reviewing,
      fullHistory,
      viewPly,
      snapshot.isGameOver,
      gameEndReason,
    ],
  );

  // -------- Click handling --------
  /** Can the human actually move a piece RIGHT NOW (not a pre-move). */
  const canHumanMove = (): boolean => {
    if (pendingPromotion || animatingMove) return false;
    if (snapshot.isGameOver || gameEndReason) return false;
    if (settings.gameMode === 'analysis') return true; // free play in analysis
    if (
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      snapshot.turn === engineSide
    ) {
      return false; // engine is thinking — pre-move only
    }
    return true;
  };

  /** True if it's the engine's turn in computer mode and the game is
   *  still in progress — i.e. the human may queue a pre-move. */
  const canPreMove = (): boolean => {
    if (pendingPromotion || animatingMove) return false;
    if (snapshot.isGameOver || gameEndReason) return false;
    return (
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      snapshot.turn === engineSide
    );
  };

  const handleSquareClick = useCallback(
    (square: Square) => {
      const piece = game.pieceAt(square);

      // Left-click clears any user-drawn arrows and square highlights.
      // This works on ANY left-click (even when the human can't move —
      // e.g. it's the computer's turn, the game is over, an animation
      // is in progress, or a promotion is pending). It's the user's
      // "clear the board" affordance.
      if (arrows.length > 0 || squareHighlights.size > 0) {
        setArrows([]);
        setSquareHighlights(new Map());
        return;
      }

      // Pre-move handling: when the engine is thinking and the human
      // clicks a from→to pair of their own pieces, queue a pre-move
      // instead of executing it. The pre-move will fire as soon as
      // it becomes the human's turn (if still legal). The user may
      // queue multiple pre-moves in sequence.
      if (canPreMove()) {
        const humanColor = engineSide === 'w' ? 'b' : 'w';
        // No pending from-piece: this is the first click of a new
        // pre-move. We just record the from square.
        if (pendingPreMoveFrom === null) {
          if (piece && piece.color === humanColor) {
            setPendingPreMoveFrom(square);
          }
          return;
        }
        // There IS a pending from-piece. Clicks:
        if (square === pendingPreMoveFrom) {
          // Same square as the from-piece → cancel that from-piece.
          setPendingPreMoveFrom(null);
          return;
        }
        const fromPiece = game.pieceAt(pendingPreMoveFrom);
        // Click on another of the human's own pieces (different from
        // the pending from) → change the from.
        if (piece && piece.color === humanColor) {
          setPendingPreMoveFrom(square);
          return;
        }
        // Otherwise: it's the destination. Append to the queue.
        if (fromPiece) {
          const promo =
            fromPiece.type === 'p' && (square[1] === '1' || square[1] === '8')
              ? 'q'
              : undefined;
          setPreMoveQueue((q) => [
            ...q,
            { from: pendingPreMoveFrom, to: square, promotion: promo },
          ]);
          // Charge 0.1s penalty per pre-move (only if the clock is
          // running — no penalty in unrated analysis).
          if (clockEnabled) {
            clock.subtractSeconds(humanColor, 0.1);
          }
          // Reset the pending from so the user can queue another
          // pre-move on the next click.
          setPendingPreMoveFrom(null);
        }
        return;
      }

      if (!canHumanMove()) return;

      if (selected === null) {
        if (piece && piece.color === game.turn()) selectSquare(square);
        return;
      }

      if (square === selected) {
        clearSelection();
        return;
      }

      if (legalTargets.has(square) || captureTargets.has(square)) {
        const fromPiece = game.pieceAt(selected);
        const isPromotion =
          fromPiece?.type === 'p' && (square[1] === '1' || square[1] === '8');
        if (isPromotion) {
          setPendingPromotion({ from: selected, to: square, color: fromPiece!.color });
          return;
        }
        tryMove(selected, square);
        clearSelection();
        return;
      }

      // Switch to a different piece
      if (piece && piece.color === game.turn()) {
        selectSquare(square);
        return;
      }
      clearSelection();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selected,
      legalTargets,
      captureTargets,
      snapshot.isGameOver,
      gameEndReason,
      pendingPromotion,
      animatingMove,
      tryMove,
      settings.gameMode,
      engineSide,
      arrows.length,
      squareHighlights.size,
      preMove,
    ],
  );

  function selectSquare(square: Square) {
    setSelected(square);
    const moves = game.legalMovesFrom(square);
    const targets = new Set<Square>();
    const captures = new Set<Square>();
    for (const m of moves) {
      if (m.isCapture) captures.add(m.to as Square);
      else targets.add(m.to as Square);
    }
    setLegalTargets(targets);
    setCaptureTargets(captures);
  }

  function clearSelection() {
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
  }

  const handlePieceDragStart = useCallback(
    (from: Square, piece: Piece) => {
      // In computer mode during the engine's turn, dragging starts a
      // pre-move (the human may be queueing a move for their next
      // turn). In other cases, dragging starts a real move.
      if (canPreMove()) {
        setPendingPreMoveFrom(from);
        return;
      }
      if (!canHumanMove()) return;
      if (piece.color !== game.turn()) return;
      selectSquare(from);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.isGameOver, gameEndReason, animatingMove, settings.gameMode, engineSide],
  );

  const handleDropOnSquare = useCallback(
    (to: Square) => {
      if (animatingMove) return;
      // If the user just started a pre-move via drag, the drop
      // completes it.
      if (pendingPreMoveFrom !== null) {
        const fromPiece = game.pieceAt(pendingPreMoveFrom);
        if (fromPiece) {
          const promo =
            fromPiece.type === 'p' && (to[1] === '1' || to[1] === '8')
              ? 'q'
              : undefined;
          setPreMoveQueue((q) => [
            ...q,
            { from: pendingPreMoveFrom, to, promotion: promo },
          ]);
          const humanColor: 'w' | 'b' =
            engineSide === 'w' ? 'b' : 'w';
          if (clockEnabled) {
            clock.subtractSeconds(humanColor, 0.1);
          }
        }
        setPendingPreMoveFrom(null);
        return;
      }
      if (preMoveQueue.length > 0) {
        // Already have queued pre-moves — ignore further drops
        // until the engine's move resolves.
        return;
      }
      if (!selected) return;
      if (!legalTargets.has(to) && !captureTargets.has(to)) {
        clearSelection();
        return;
      }
      const fromPiece = game.pieceAt(selected);
      if (!fromPiece) return;
      const isPromotion = fromPiece.type === 'p' && (to[1] === '1' || to[1] === '8');
      if (isPromotion) {
        setPendingPromotion({ from: selected, to, color: fromPiece.color });
        return;
      }
      tryMove(selected, to);
      clearSelection();
    },
    [selected, legalTargets, captureTargets, animatingMove, tryMove, pendingPreMoveFrom, preMoveQueue.length, clock, clockEnabled, engineSide],
  );

  const handleDragEnd = useCallback(() => clearSelection(), []);

  // -------- Promotion --------
  const onChoosePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    clearSelection();
  };
  const onCancelPromotion = () => setPendingPromotion(null);

  // -------- Game lifecycle --------
  const resetGame = () => {
    game.reset();
    setFen(game.fen());
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
    setLastMove(null);
    setAnimatingMove(null);
    setCaptures({ white: [], black: [] });
    setViewPly(0);
    setFullHistory([]);
    setEngineSide(null);
    engine.clearBestMove();
    engine.stop();
    clock.reset({ initialSeconds: 0, incrementSeconds: 0 });
    setClockEnabled(false);
    setGameEndReason(null);
    setDrawOffer(null);
    setReviewing(false);
    setArrows([]);
    setSquareHighlights(new Map());
    setPreMoveQueue([]);
    setPendingPreMoveFrom(null);
  };

  // -------- Arrow drawing (right-click drag, chess.com style) --------
  const onArrowDraw = useCallback(
    (from: Square, to: Square, color: ArrowColor) => {
      setArrows((prev) => {
        // If an arrow in the same color exists in the same direction,
        // remove it (toggle off). If one exists in the opposite
        // direction with the same color, replace it.
        const same = prev.findIndex(
          (a) => a.from === from && a.to === to && a.color === color,
        );
        if (same >= 0) {
          const next = prev.slice();
          next.splice(same, 1);
          return next;
        }
        const reverse = prev.findIndex(
          (a) => a.from === to && a.to === from && a.color === color,
        );
        if (reverse >= 0) {
          const next = prev.slice();
          next.splice(reverse, 1);
          next.push({ from, to, color });
          return next;
        }
        // Multiple arrows are allowed from a single square (different
        // targets, different colors). We deliberately do NOT remove
        // existing arrows from `from` — the user can have many
        // outgoing arrows from one square.
        return [...prev, { from, to, color }];
      });
    },
    [],
  );

  const onArrowEraseAt = useCallback((square: Square) => {
    setArrows((prev) => prev.filter((a) => a.from !== square && a.to !== square));
  }, []);

  // Right-click (no drag) on a square toggles a single-square highlight in
  // the currently selected color. Same color+square removes the highlight.
  const onSquareRightClick = useCallback(
    (square: Square, color: ArrowColor) => {
      setSquareHighlights((prev) => {
        const next = new Map(prev);
        if (next.get(square) === color) {
          next.delete(square);
        } else {
          next.set(square, color);
        }
        return next;
      });
    },
    [],
  );

  const onClearArrows = useCallback(() => {
    setArrows([]);
    setSquareHighlights(new Map());
  }, []);

  // Esc clears all user-drawn arrows and highlights
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setArrows([]);
        setSquareHighlights(new Map());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onStartNewGame = (config: GameConfig) => {
    resetGame();

    setCommittedSettings({
      ...settings,
      gameMode: config.mode,
      engineLevel: config.level ?? settings.engineLevel,
      playerSide: config.side ?? settings.playerSide,
    });

    if (config.mode === 'computer') {
      setEngineSide(pickEngineSide(config.side ?? settings.playerSide));
      // Auto-orient so the human player's side is at the bottom.
      const playerColor = config.side ?? settings.playerSide;
      if (playerColor === 'w' || playerColor === 'b') {
        setOrientation(playerColor);
      }
    } else if (config.mode === 'analysis') {
      setEngineSide(null);
    } else {
      setEngineSide(null);
    }

    if (isPlayMode(config.mode)) {
      const totalSeconds = config.timeMin * 60 + config.timeSec;
      if (totalSeconds > 0 || config.increment > 0) {
        clock.reset({ initialSeconds: totalSeconds, incrementSeconds: config.increment });
        setClockEnabled(true);
        clock.switchTo('w');
      } else {
        clock.reset({ initialSeconds: 0, incrementSeconds: 0 });
        setClockEnabled(false);
      }
    } else {
      clock.reset({ initialSeconds: 0, incrementSeconds: 0 });
      setClockEnabled(false);
    }

    setNewGameOpen(false);
  };

  // -------- Lichess game import --------
  // Replace the current game with the imported one. The user can
  // then step through the moves in analysis mode.
  const onSelectLichessGame = (imported: { moves: string[]; headers: Record<string, string> }) => {
    // Persist to history (in addition to in-memory state) so a
    // page reload restores the game.
    try {
      localStorage.setItem('chess-analyzer.imported-game', JSON.stringify(imported));
    } catch {
      /* ignore */
    }
    setLichessHeaders(imported.headers);
    // Reset the GameState and replay the moves to ensure they're all
    // legal. If any move fails, we stop at that point.
    const tempGame = new GameState();
    const validMoves: string[] = [];
    for (const san of imported.moves) {
      try {
        tempGame.moveSan(san);
        validMoves.push(san);
      } catch {
        break;
      }
    }
    setFullHistory(validMoves);
    setFen(tempGame.fen());
    setViewPly(validMoves.length);
    setLastMove(null);
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
    setAnimatingMove(null);
    setPendingPromotion(null);
    setGameEndReason(null);
    setDrawOffer(null);
    setReviewing(false);
    setArrows([]);
    setSquareHighlights(new Map());
    setPreMoveQueue([]);
    setPendingPreMoveFrom(null);
    setEngineSide(null);
    setClockEnabled(false);
    clock.reset({ initialSeconds: 0, incrementSeconds: 0 });
    setCaptures({ white: [], black: [] });
    // Auto-enter analysis mode so the user can step through.
    setCommittedSettings({
      ...settings,
      gameMode: 'analysis',
    });
  };

  // -------- Undo (computer mode only) --------
  const onUndo = () => {
    if (animatingMove) return;
    if (settings.gameMode !== 'computer') return;
    if (fullHistory.length === 0) return;
    if (viewPly < fullHistory.length) jumpToPly(fullHistory.length);

    // Determine the color of the last move in history. White moves
    // first, so ply 1 is white, ply 2 is black, etc.
    const lastPly = fullHistory.length;
    const lastMoveColor: 'w' | 'b' = lastPly % 2 === 1 ? 'w' : 'b';
    const humanColor: 'w' | 'b' = engineSide === 'w' ? 'b' : 'w';
    // Undo enough plies so we end up with the position BEFORE the
    // human's most recent move. If the last move was the human's,
    // remove just 1 ply. If the last move was the computer's, remove
    // 2 (computer + previous human move). If the first move was the
    // computer's, only remove 1.
    const undoCount =
      lastMoveColor === humanColor || lastPly === 1 ? 1 : 2;
    const newHistory = fullHistory.slice(0, Math.max(0, lastPly - undoCount));
    setFullHistory(newHistory);
    game.reset();
    const newCaptures = { white: [] as Piece[], black: [] as Piece[] };
    for (const san of newHistory) {
      const r = game.moveSan(san);
      if (r && r.isCapture && r.captured) {
        const cp: Piece = {
          color: r.color === 'w' ? 'b' : 'w',
          type: r.captured as Piece['type'],
        };
        const key = cp.color === 'w' ? 'white' : 'black';
        newCaptures[key].push(cp);
      }
    }
    setCaptures(newCaptures);
    setFen(game.fen());
    setViewPly(newHistory.length);
    setLastMove(null);
    setPreMoveQueue([]);
    setPendingPreMoveFrom(null);
    engine.clearBestMove();
    engine.stop();
  };

  // -------- History navigation (pure navigation, never deletes) --------
  const jumpToPly = (ply: number) => {
    if (animatingMove) return;
    if (ply < 0) {
      game.reset();
      setFen(INITIAL_FEN);
      setViewPly(0);
      setLastMove(null);
      setSelected(null);
      return;
    }
    game.reset();
    for (let i = 0; i < ply && i < fullHistory.length; i++) {
      game.moveSan(fullHistory[i]);
    }
    setFen(game.fen());
    setViewPly(ply);
    if (ply > 0) {
      const moves = game.historyVerbose();
      const m = moves[moves.length - 1];
      setLastMove(m ? { from: m.from as Square, to: m.to as Square } : null);
    } else {
      setLastMove(null);
    }
    setSelected(null);
  };
  const onJumpTo = (ply: number) => jumpToPly(ply);
  const onJumpStart = () => jumpToPly(0);
  const onJumpBack = () => jumpToPly(Math.max(0, viewPly - 1));
  // One click = one move forward, regardless of which color made
  // the next move. Matches the standard chess.com / Lichess behavior.
  const onJumpForward = () =>
    jumpToPly(Math.min(fullHistory.length, viewPly + 1));
  const onJumpEnd = () => jumpToPly(fullHistory.length);

  const onFlip = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  // -------- Game end / review --------
  const isGameEnded = !!(snapshot.isGameOver || gameEndReason);
  const isReviewMode = reviewing && isGameEnded;

  // Auto-stop engine if game ended. Also stop the clock so the
  // user can review without the time ticking.
  useEffect(() => {
    if (isGameEnded) {
      void engineStop();
      clock.switchTo(null);
      setPreMoveQueue([]);
      setPendingPreMoveFrom(null);
    }
  }, [isGameEnded, clock, engineStop]);

  // Pause the clock whenever we're in review mode (chess.com-style:
  // review freezes the clock so the user can analyze without
  // pressure).
  useEffect(() => {
    if (isReviewMode) {
      clock.switchTo(null);
    }
  }, [isReviewMode, clock]);

  // Draw / resign only in play modes
  const canOfferDraw = isPlayMode(settings.gameMode);
  const canResign = isPlayMode(settings.gameMode);

  const onOfferDraw = () => {
    if (!canOfferDraw) return;
    if (isGameEnded) return;
    if (settings.gameMode === 'computer') {
      // Engine would normally accept/reject; we just decline
      emit({ type: 'illegal' });
      return;
    }
    setDrawOffer(game.turn());
  };
  const onAcceptDraw = () => {
    setDrawOffer(null);
    setGameEndReason({ kind: 'draw' });
  };
  const onDeclineDraw = () => setDrawOffer(null);

  const onResign = () => {
    if (!canResign || isGameEnded) return;
    if (settings.gameMode === 'computer' && engineSide !== null) {
      const human: 'w' | 'b' = engineSide === 'w' ? 'b' : 'w';
      setGameEndReason({ kind: 'resign', side: human });
    } else {
      setGameEndReason({ kind: 'resign', side: game.turn() });
    }
  };

  const onReview = () => {
    // The game has ended; jump to the start so the user can review with
    // the engine thinking on every position they navigate to.
    setReviewing(true);
    clock.switchTo(null);
    jumpToPly(0);
  };
  const onExitReview = () => {
    setReviewing(false);
    clock.switchTo(null);
  };

  // -------- Restore last imported Lichess game on first mount --------
  // We do this in a separate effect after onSelectLichessGame is
  // defined so the closure has access to the latest setter chain.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chess-analyzer.imported-game');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        moves: string[];
        headers: Record<string, string>;
      };
      if (parsed.moves && parsed.moves.length > 0) {
        onSelectLichessGame(parsed);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Engine integration --------
  // The engine should think:
  //   - during analysis mode (anytime the user is exploring)
  //   - when the user is reviewing past moves (post-game review)
  //   - when it's the engine's turn in computer mode and the game is
  //     still in progress (so the computer can play its moves)
  const isComputerPlaying =
    settings.gameMode === 'computer' &&
    engineSide !== null &&
    viewPly === fullHistory.length &&
    snapshot.turn === engineSide &&
    !isGameEnded &&
    !gameEndReason;
  // The engine runs (think + emit bestmove) in analysis, review, and
  // when it's the computer's turn. The eval BAR is shown only in
  // analysis or review — never while playing vs the computer, so the
  // human can't peek at the live eval.
  const isEngineThinking =
    settings.gameMode === 'analysis' || reviewing || isComputerPlaying;

  useEffect(() => {
    if (isEngineThinking) {
      engineRequestEval(fen, settings.engineLevel);
    } else {
      void engineStop();
    }
  }, [fen, isEngineThinking, engineRequestEval, engineStop, settings.engineLevel]);

  // Pre-move: when it's the human's turn in computer mode and at
  // least one pre-move is queued, play the next one if it's still
  // legal. Otherwise drop it silently. We play moves one at a time;
  // each successful play updates the fen, which re-triggers this
  // effect to handle the next item in the queue.
  useEffect(() => {
    if (preMoveQueue.length === 0) return;
    if (settings.gameMode !== 'computer') return;
    if (engineSide === null) return;
    if (snapshot.turn === engineSide) return; // still engine's turn
    if (isGameEnded || gameEndReason) {
      setPreMoveQueue([]);
      setPendingPreMoveFrom(null);
      return;
    }
    if (animatingMove) return; // wait for the engine's move to finish animating
    const next = preMoveQueue[0];
    if (!next) return;
    const legal = game.legalMovesFrom(next.from);
    const stillLegal = legal.some(
      (m) =>
        m.to === next.to &&
        (m.promotion ?? undefined) === next.promotion,
    );
    if (stillLegal) {
      setPreMoveQueue((q) => q.slice(1));
      tryMove(next.from, next.to, next.promotion);
    } else {
      // The queued move isn't legal (e.g. the engine took our piece).
      // Drop the entire queue silently.
      setPreMoveQueue([]);
      setPendingPreMoveFrom(null);
    }
  }, [
    preMoveQueue,
    settings.gameMode,
    engineSide,
    snapshot.turn,
    isGameEnded,
    gameEndReason,
    animatingMove,
    fen,
    tryMove,
  ]);

  // Apply engine's best move
  useEffect(() => {
    if (
      engineBestMove &&
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      snapshot.turn === engineSide &&
      !isGameEnded &&
      !gameEndReason
    ) {
      const m = engineBestMove;
      engineClearBestMove();
      const from = m.slice(0, 2) as Square;
      const to = m.slice(2, 4) as Square;
      const promo = m.length > 4 ? (m[4] as 'q' | 'r' | 'b' | 'n') : undefined;
      tryMove(from, to, promo);
    } else if (
      !engineBestMove &&
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      snapshot.turn === engineSide &&
      !isGameEnded &&
      !gameEndReason &&
      engine.status === 'error'
    ) {
      // No engine bridge running — pick a random legal move so the
      // user can still play around. The status bar will show the
      // bridge command.
      const legal = game.legalMoves();
      if (legal.length > 0) {
        const choice = legal[Math.floor(Math.random() * legal.length)];
        if (choice) {
          const promo = choice.promotion
            ? (choice.promotion as 'q' | 'r' | 'b' | 'n')
            : undefined;
          window.setTimeout(
            () => tryMove(choice.from as Square, choice.to as Square, promo),
            500,
          );
        }
      }
    }
  }, [engineBestMove, settings.gameMode, engineSide, isGameEnded, gameEndReason, snapshot.turn, tryMove, engineClearBestMove, engine.status]);

  // -------- Status text --------
  // Eval bar only in analysis / review — never during an active play
  // (vs computer or vs local) so the human can't see the live eval.
  const showEvalBar =
    settings.evalBarEnabled &&
    (settings.gameMode === 'analysis' || reviewing);

  // Stockfish reports scores from the side-to-move's perspective. The eval
  // bar is always drawn from White's perspective, so flip the sign when it's
  // Black to move.
  const scoreCpWhite: number | null =
    engine.scoreCp === null
      ? null
      : snapshot.turn === 'b'
        ? -engine.scoreCp
        : engine.scoreCp;
  const scoreMateWhite: number | null =
    engine.scoreMate === null
      ? null
      : snapshot.turn === 'b'
        ? -engine.scoreMate
        : engine.scoreMate;

  const statusText = (() => {
    if (gameEndReason?.kind === 'draw') return 'Draw by agreement';
    if (gameEndReason?.kind === 'resign') {
      return `${gameEndReason.side === 'w' ? 'White' : 'Black'} resigns — ${
        gameEndReason.side === 'w' ? 'Black' : 'White'
      } wins`;
    }
    if (clockEnabled && clock.winner) {
      return `Time — ${clock.winner === 'w' ? 'White' : 'Black'} wins on time`;
    }
    if (snapshot.isCheckmate) {
      return `Checkmate — ${snapshot.turn === 'w' ? 'Black' : 'White'} wins`;
    }
    if (snapshot.isStalemate) return 'Stalemate — Draw';
    if (snapshot.isInsufficientMaterial) return 'Draw — Insufficient material';
    if (snapshot.isThreefoldRepetition) return 'Draw — Threefold repetition';
    if (snapshot.isDraw) return 'Draw';
    if (drawOffer && settings.gameMode === 'local') {
      return `${drawOffer === 'w' ? 'White' : 'Black'} offers a draw`;
    }
    if (settings.gameMode === 'analysis') {
      return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move • Analysis`;
    }
    if (settings.gameMode === 'computer' && engineSide !== null) {
      const human = engineSide === 'w' ? 'Black' : 'White';
      const eng = engineSide === 'w' ? 'White (Engine)' : 'Black (Engine)';
      if (snapshot.inCheck) {
        return `${snapshot.turn === 'w' ? human : eng} to move — Check`;
      }
      return `${snapshot.turn === engineSide ? eng : human} to move`;
    }
    if (snapshot.inCheck) return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move — Check`;
    return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`;
  })();

  const bottomSide: 'w' | 'b' = orientation;
  const topSide: 'w' | 'b' = orientation === 'w' ? 'b' : 'w';

  return (
    <div className={`app ${isReviewMode ? 'review-mode' : ''}`}>
      <main className="app-main">
        <div className="board-area">
          <header className="app-header">
            <h1>Chess Analyzer <span className="beta-tag">beta</span></h1>
          </header>
          <div className="status-bar" data-status={snapshot.inCheck ? 'check' : ''}>
            {statusText}
            {lichessHeaders?.White && lichessHeaders?.Black && (
              <span className="lichess-info">
                {' • '}
                {lichessHeaders.White} vs {lichessHeaders.Black}
                {lichessHeaders.Opening ? ` (${lichessHeaders.Opening})` : ''}
                {lichessHeaders.Result ? ` — ${lichessHeaders.Result}` : ''}
              </span>
            )}
            {moveClassifications.openingName && (
              <span className="lichess-info">
                {' • '}{moveClassifications.openingName}
              </span>
            )}
            {moveClassifications.bulkLoading && (
              <span className="lichess-info">
                {' • analyzing '}
                {moveClassifications.evaluatedPlies}/
                {moveClassifications.totalPlies}…
              </span>
            )}
            {preMovesEnabled && queuedCount > 0 && (
              <span className="lichess-info">
                {' • pre-move'}{queuedCount > 1 ? 's' : ''} queued
                {queuedCount > 1 ? ` (${queuedCount})` : ''}: {preMoveQueue.map((m) => `${m.from}→${m.to}`).join(', ')}
                {pendingPreMoveFrom && ` (+ ${pendingPreMoveFrom}→?)`}
              </span>
            )}
            {preMovesEnabled && queuedCount === 0 && pendingPreMoveFrom && (
              <span className="lichess-info">
                {' • click a destination for your pre-move (from '}
                {pendingPreMoveFrom}{')'}
              </span>
            )}
            {settings.gameMode === 'computer' && engine.status === 'thinking' && ' • thinking…'}
            {settings.gameMode === 'computer' && engine.status === 'loading' && (
              <span className="status-error">
                {' • engine offline — run: node scripts/stockfish-bridge.js'}
              </span>
            )}
            {engine.status === 'error' && engine.error && (
              <span className="status-error"> • engine error: {engine.error}</span>
            )}
          </div>
          <CapturedRow captures={captures} side={topSide} />
          {clockEnabled && (
            <ClockDisplay
              side={topSide}
              seconds={topSide === 'w' ? clock.whiteSeconds : clock.blackSeconds}
              active={clock.running === topSide}
              label={topSide === 'w' ? 'White' : 'Black'}
            />
          )}
          {showEvalBar && settings.evalBarPosition === 'top' && (
            <EvalBar
              scoreCp={scoreCpWhite}
              scoreMate={scoreMateWhite}
              showText
              orientation="horizontal"
              position="top"
              title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
              status={engine.status}
              bestLine={engine.bestLine}
            />
          )}
          <div className={`board-row eval-pos-${settings.evalBarPosition}`}>
            {showEvalBar && settings.evalBarPosition === 'left' && (
              <EvalBar
                scoreCp={scoreCpWhite}
                scoreMate={scoreMateWhite}
                showText
                orientation="vertical"
                position="left"
                title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
                status={engine.status}
                bestLine={engine.bestLine}
              />
            )}
            <Board
              board={board}
              orientation={orientation}
              selectedSquare={selected}
              legalTargets={legalTargets}
              captureTargets={captureTargets}
              lastMove={lastMove}
              kingInCheck={kingInCheck}
              animatingMove={animatingMove}
              arrows={allArrows}
              squareHighlights={squareHighlights}
              arrowColor={arrowColor}
              preMoveHighlights={
                preMovesEnabled
                  ? [
                      ...preMoveQueue.map((m) => ({ from: m.from, to: m.to })),
                      ...(pendingPreMoveFrom
                        ? [{ from: pendingPreMoveFrom, to: pendingPreMoveFrom, pending: true }]
                        : []),
                    ]
                  : null
              }
              moveTagsByTo={moveTagsByTo}
              onArrowDraw={onArrowDraw}
              onArrowEraseAt={onArrowEraseAt}
              onSquareRightClick={onSquareRightClick}
              onSquareClick={handleSquareClick}
              onPieceDragStart={handlePieceDragStart}
              onDragOverSquare={() => {}}
              onDropOnSquare={handleDropOnSquare}
              onDragEnd={handleDragEnd}
              onAnimationDone={() => setAnimatingMove(null)}
            />
            {showEvalBar && settings.evalBarPosition === 'right' && (
              <EvalBar
                scoreCp={scoreCpWhite}
                scoreMate={scoreMateWhite}
                showText
                orientation="vertical"
                position="right"
                title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
                status={engine.status}
                bestLine={engine.bestLine}
              />
            )}
          </div>
          {showEvalBar && settings.evalBarPosition === 'bottom' && (
            <EvalBar
              scoreCp={scoreCpWhite}
              scoreMate={scoreMateWhite}
              showText
              orientation="horizontal"
              position="bottom"
              title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
              status={engine.status}
              bestLine={engine.bestLine}
            />
          )}
          {clockEnabled && (
            <ClockDisplay
              side={bottomSide}
              seconds={bottomSide === 'w' ? clock.whiteSeconds : clock.blackSeconds}
              active={clock.running === bottomSide}
              label={bottomSide === 'w' ? 'White' : 'Black'}
            />
          )}
          <CapturedRow captures={captures} side={bottomSide} />
          {showThreatsNow && attackDescriptions.length > 0 && (
            <div className="attack-panel" role="status" aria-live="polite">
              {attackDescriptions.map((d, i) => {
                const pieceName = PIECE_DISPLAY[d.attackerType] ?? d.attackerType.toUpperCase();
                const targetName = PIECE_DISPLAY[d.targetType] ?? d.targetType.toUpperCase();
                const side = d.attackerColor === 'w' ? 'White' : 'Black';
                const opp = d.attackerColor === 'w' ? 'Black' : 'White';
                return (
                  <div key={i} className="attack-line">
                    <span className={`attack-side attack-side-${d.attackerColor}`}>{side}</span>
                    <span className="attack-piece">{pieceName}</span>
                    <span className="attack-square">on {d.attackerSquare}</span>
                    <span className="attack-verb">attacks</span>
                    <span className="attack-piece attack-piece-target">{opp} {targetName}</span>
                    <span className="attack-square">on {d.targetSquare}</span>
                  </div>
                );
              })}
            </div>
          )}
          {isGameEnded && !isReviewMode && (
            <div className="post-game-actions">
              <button className="primary-action" onClick={onReview}>
                Review
              </button>
            </div>
          )}
          {isReviewMode && (
            <div className="post-game-actions">
              <button onClick={onExitReview}>Back to result</button>
            </div>
          )}
          {/* Game actions (Draw/Resign) — only in a play mode AND only once a
              game is actually in progress (at least one move played). */}
          {isPlayMode(settings.gameMode) && !isGameEnded && fullHistory.length > 0 && (
            <div className="game-actions">
              {!drawOffer && canOfferDraw && (
                <button onClick={onOfferDraw} title="Offer a draw" className="game-action-btn">
                  🤝 Draw
                </button>
              )}
              {drawOffer && settings.gameMode === 'local' && (
                <>
                  <span className="draw-offer-label">
                    {drawOffer === 'w' ? 'White' : 'Black'} offers draw
                  </span>
                  <button onClick={onAcceptDraw} className="primary-action game-action-btn">
                    Accept
                  </button>
                  <button onClick={onDeclineDraw} className="game-action-btn">
                    Decline
                  </button>
                </>
              )}
              {canResign && (
                <button
                  onClick={onResign}
                  className="danger-action game-action-btn"
                  title="Resign the game"
                >
                  🏳 Resign
                </button>
              )}
            </div>
          )}
          <div className="arrow-toolbar" role="toolbar" aria-label="Arrow tools">
            <span className="arrow-toolbar-label">Arrow:</span>
            {(['green', 'red', 'yellow', 'blue'] as ArrowColor[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`arrow-swatch arrow-swatch-${c} ${arrowColor === c ? 'selected' : ''}`}
                aria-label={`${c} arrow`}
                title={`${c[0].toUpperCase()}${c.slice(1)} arrow`}
                onClick={() => setArrowColor(c)}
              />
            ))}
            <button
              type="button"
              className="arrow-clear-btn"
              onClick={onClearArrows}
              disabled={arrows.length === 0}
              title="Clear all arrows (Esc)"
            >
              Clear
            </button>
            <span className="arrow-hint">Right-click + drag on the board to draw</span>
          </div>
          <div className="controls">
            <button onClick={() => setNewGameOpen(true)}>New Game</button>
            <button
              onClick={() => setLichessOpen(true)}
              title="Import a game from Lichess"
            >
              Lichess
            </button>
            <button
              onClick={onUndo}
              disabled={
                settings.gameMode !== 'computer' ||
                fullHistory.length === 0 ||
                animatingMove !== null ||
                isGameEnded
              }
              title={
                settings.gameMode === 'computer'
                  ? 'Undo last move'
                  : 'Undo only available vs Computer'
              }
            >
              Undo
            </button>
            <button onClick={onFlip}>Flip</button>
            <button onClick={() => setSettingsOpen(true)} aria-label="Open settings">
              Settings
            </button>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-panel-spacer" aria-hidden="true" />
          <MoveHistory
            history={fullHistory}
            sanMoves={useMemo(() => fullHistory.map((san) => ({ san } as LegalMove)), [fullHistory])}
            currentPly={viewPly}
            onJumpTo={onJumpTo}
            onJumpStart={onJumpStart}
            onJumpBack={onJumpBack}
            onJumpForward={onJumpForward}
            onJumpEnd={onJumpEnd}
            classifications={moveClassifications.classifications}
            bulkProgress={
              moveClassifications.bulkLoading
                ? { done: moveClassifications.evaluatedPlies, total: moveClassifications.totalPlies }
                : null
            }
          />
        </aside>
      </main>
      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={onChoosePromotion}
          onCancel={onCancelPromotion}
        />
      )}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewGameDialog
        open={newGameOpen}
        onStart={onStartNewGame}
        onCancel={() => setNewGameOpen(false)}
      />
      <LichessImportDialog
        open={lichessOpen}
        onClose={() => setLichessOpen(false)}
        onSelect={onSelectLichessGame}
      />
    </div>
  );
}

export default App;
