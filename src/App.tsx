import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from './components/Board';
import { MoveHistory } from './components/MoveHistory';
// ThreatsPanel is rendered conditionally below when we add per-side
// threats back. Removed for now to silence unused-var warnings.
import { PromotionDialog } from './components/PromotionDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { CapturedRow } from './components/CapturedPieces';
import { EvalBar } from './components/EvalBar';
import { ClockDisplay } from './components/ClockDisplay';
import { NewGameDialog } from './components/NewGameDialog';
import { LichessImportDialog } from './components/LichessImportDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
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
import { useLiveAttacks, type Arrow, type ArrowColor } from './chess/threats';
import { useMoveClassification } from './chess/useMoveClassification';
import type { MoveTag } from './chess/classifier';
import './App.css';

// ---------------- Types ----------------

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
  const engine = useEngine(settings.engineMode);
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
  /** True when the user has expanded the board to fill the
   *  viewport (chess.com / Lichess "fullscreen board" mode). The
   *  side panel is hidden in this mode; the user can click an exit
   *  button (or press Esc) to return. */
  const [boardFullscreen, setBoardFullscreen] = useState(false);
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
  /** Per-ply clock snapshot: how many seconds were left on the
   *  mover's clock at the time each move was played. Used to
   *  display a time column in the move list when reviewing a
   *  game played with a clock. Index = ply (0 = starting position,
   *  1 = after move 1, etc.). */
  const [moveTimes, setMoveTimes] = useState<number[]>([0]);
  const preMove = preMoveQueue[0] ?? null;
  const preMovesEnabled = settings.gameMode === 'computer';
  // Number of pre-moves that have already been queued (excluding the
  // pending one being composed). We display this in the status bar.
  const queuedCount = preMoveQueue.length;

  // -------- Derived state --------
  const snapshot = game.snapshot();
  // Whether we're in a mode where the human is actually playing
  // (vs Local or vs Computer) and the game is still in progress.
  // Used to gate in-app and browser-level "leave / clobber" prompts.
  const isLivePlay = settings.gameMode === 'local' || settings.gameMode === 'computer';
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
    lineCount: settings.showAnalysisLines ? settings.analysisLineCount : 1,
  });

  // Convert the engine's top-N principal variations at the current
  // viewPly into arrows drawn on the board. Each PV is a list of
  // moves in UCI (e2e4, e7e5, ...) — we turn them into (from→to)
  // arrows. The best line uses blue (chess.com-style), 2nd is
  // yellow, 3rd is red.
  const analysisArrows = useMemo<Arrow[]>(() => {
    if (
      !settings.showAnalysisLines ||
      !moveClassifications.linesByPly.has(viewPly)
    ) {
      return [];
    }
    const lines = moveClassifications.linesByPly.get(viewPly) ?? [];
    const colors: ArrowColor[] = ['blue', 'yellow', 'red'];
    const out: Arrow[] = [];
    for (let i = 0; i < Math.min(lines.length, settings.analysisLineCount); i++) {
      const line = lines[i];
      const uci = line.pv;
      for (let j = 0; j < uci.length - 1; j += 1) {
        const move = uci[j];
        if (move.length < 4) continue;
        const from = move.slice(0, 2) as Square;
        const to = move.slice(2, 4) as Square;
        out.push({
          from,
          to,
          color: colors[i] ?? 'white',
          weight: i === 0 ? 'thick' : 'normal',
          auto: true,
        });
      }
    }
    return out;
  }, [
    moveClassifications.linesByPly,
    viewPly,
    settings.showAnalysisLines,
    settings.analysisLineCount,
  ]);

  const allArrows = useMemo(
    () => [...threatArrows, ...arrows, ...analysisArrows],
    [threatArrows, arrows, analysisArrows],
  );

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

  // Pre-built array of `{ san }` for MoveHistory. Computed here
  // (outside the side-panel JSX) so the useMemo always runs every
  // render — conditionally placing hooks inside JSX is a React error
  // (#300) when the component can mount/unmount based on flags
  // like `boardFullscreen`.
  const moveHistorySANS = useMemo(
    () => fullHistory.map((san) => ({ san } as LegalMove)),
    [fullHistory],
  );
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
  // tryMove is a stable callback — internal closures that depend
  // on `clock`, `engine`, `game`, etc. read from refs so the
  // callback identity doesn't change on every render (which
  // would cascade and trigger React error #185 — infinite render).
  const gameRef = useRef(game);
  gameRef.current = game;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const reviewingRef = useRef(reviewing);
  reviewingRef.current = reviewing;
  const fullHistoryRef = useRef(fullHistory);
  fullHistoryRef.current = fullHistory;
  const viewPlyRef = useRef(viewPly);
  viewPlyRef.current = viewPly;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const gameEndReasonRef = useRef(gameEndReason);
  gameEndReasonRef.current = gameEndReason;
  const clockEnabledRef = useRef(clockEnabled);
  clockEnabledRef.current = clockEnabled;
  const clockSwitchToRef = useRef(clock.switchTo);
  clockSwitchToRef.current = clock.switchTo;
  const clockAddIncrementRef = useRef(clock.addIncrement);
  clockAddIncrementRef.current = clock.addIncrement;
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const g = gameRef.current;
      const piece = g.pieceAt(from);
      if (!piece) return null;
      // If we're in review mode and the user makes a move from a
      // mid-game position, exit review and resume the game
      // (chess.com-style "Return to game from this move").
      if (reviewingRef.current && (snapshotRef.current.isGameOver || gameEndReasonRef.current)) {
        setReviewing(false);
        const replay = fullHistoryRef.current.slice(0, viewPlyRef.current);
        g.reset();
        for (const san of replay) {
          try {
            g.moveSan(san);
          } catch {
            break;
          }
        }
      }
      const result = g.move(from, to, promotion);
      if (!result) {
        emitRef.current({ type: 'illegal' });
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
      setFen(g.fen());
      setViewPly((v) => v + 1);
      setFullHistory((h) => {
        // If we're in analysis mode (or in any mode where the user
        // has rewound and is now making a new move), truncate any
        // moves after the current view position. The new move
        // becomes the only continuation from here.
        if (settingsRef.current.gameMode === 'analysis') {
          return [...h.slice(0, viewPlyRef.current), result.san];
        }
        return [...h, result.san];
      });
      if (clockEnabledRef.current) {
        // Snapshot the time left on the mover's clock (after the
        // increment) for the move list.
        const moverSide = result.color;
        const c = clockRef.current;
        const remaining = moverSide === 'w' ? c.whiteSeconds : c.blackSeconds;
        const finalTime = remaining + c.incrementSeconds;
        setMoveTimes((t) => [...t, finalTime]);
        clockAddIncrementRef.current(result.color);
        clockSwitchToRef.current(g.turn());
      } else {
        setMoveTimes((t) => [...t, 0]);
      }

      if (captured) {
        setCaptures((prev) => {
          const key = captured.color === 'w' ? 'white' : 'black';
          return { ...prev, [key]: [...prev[key], captured] };
        });
      }

      const emit = emitRef.current;
      if (result.isCastle) emit({ type: 'castle', move: result });
      else if (result.isCapture) emit({ type: 'capture', move: result });
      else emit({ type: 'move', move: result });

      const nextSnap = g.snapshot();
      if (nextSnap.isCheckmate) emit({ type: 'checkmate' });
      else if (nextSnap.isStalemate || nextSnap.isDraw) emit({ type: 'draw' });
      else if (nextSnap.inCheck) emit({ type: 'check' });

      const s = settingsRef.current;
      if (s.flipAfterMove && s.gameMode !== 'computer') {
        setTimeout(
          () => setOrientation((o) => (o === 'w' ? 'b' : 'w')),
          ANIMATION_DURATIONS_MS[s.animationSpeed],
        );
      }
      return result;
    },
    // Empty deps: the callback is stable across renders. All external
    // values are read through refs (declared above). This prevents the
    // infinite re-render loop that React error #185 was tripping.
    [],
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

  const onClearPreMoves = useCallback(() => {
    setPreMoveQueue([]);
    setPendingPreMoveFrom(null);
  }, []);

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
      // Play the move's sound effect so the user hears the moves
      // as they scrub through the game in review / analysis.
      if (m) {
        const isCastle =
          (m.flags as string).includes('k') || (m.flags as string).includes('q');
        if (isCastle) emit({ type: 'castle', move: m });
        else if (m.captured) emit({ type: 'capture', move: m });
        else emit({ type: 'move', move: m });
      }
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
  // user can review without the time ticking. We reference the
  // clock via a ref so we don't re-fire this effect every render
  // (the useChessClock hook returns a new object each render, which
  // would otherwise cause an infinite update loop).
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const engineStopRef = useRef(engineStop);
  engineStopRef.current = engineStop;
  useEffect(() => {
    if (isGameEnded) {
      void engineStopRef.current();
      clockRef.current.switchTo(null);
      setPreMoveQueue([]);
      setPendingPreMoveFrom(null);
    }
  }, [isGameEnded]);

  // Pause the clock whenever we're in review mode (chess.com-style:
  // review freezes the clock so the user can analyze without
  // pressure). We use a ref to `clock` so this doesn't re-run on
  // every render (the chess clock returns a new object each render).
  useEffect(() => {
    if (isReviewMode) {
      clockRef.current.switchTo(null);
    }
  }, [isReviewMode]);

  // Esc key exits fullscreen board mode.
  useEffect(() => {
    if (!boardFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBoardFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardFullscreen]);

  // Arrow-key navigation through moves. ←/↓ step backward, →/↑ step
  // forward, Home/End jump to start/end. We only intercept these
  // keys when the user isn't typing in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        onJumpBack();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        onJumpForward();
      } else if (e.key === 'Home') {
        e.preventDefault();
        onJumpStart();
      } else if (e.key === 'End') {
        e.preventDefault();
        onJumpEnd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // onJumpBack/Forward/Start/End are stable from useCallback below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user is in the middle of a live game, warn them before
  // they navigate away (refresh, close tab, back button). This is
  // a browser-native confirm dialog — it can't be styled but it
  // works reliably.
  useEffect(() => {
    if (!isLivePlay || isGameEnded) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the custom message and show their own.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isLivePlay, isGameEnded]);

  // Also intercept in-app navigation buttons (the "Lichess" import
  // or "New Game" button) so they prompt before clobbering an
  // in-progress game.

  // Draw / resign only in play modes. We do NOT allow draw offers
  // against the computer (the engine can't accept / decline) — the
  // user can just resign or play on. Resign always asks for
  // confirmation via a modal so a stray click doesn't end the game.
  const canOfferDraw = settings.gameMode === 'local';
  const canResign = isLivePlay;
  const [resignPrompt, setResignPrompt] = useState<{
    side: 'w' | 'b';
  } | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<null | 'unsaved' | 'live'>(null);

  const onOfferDraw = () => {
    if (!canOfferDraw) return;
    if (isGameEnded) return;
    setDrawOffer(game.turn());
  };
  const onAcceptDraw = () => {
    setDrawOffer(null);
    setGameEndReason({ kind: 'draw' });
  };
  // onDeclineDraw kept for symmetry with onAcceptDraw; both wired
  // through the draw-offer UI when it's shown.
  const onDeclineDraw = () => setDrawOffer(null);
  void onAcceptDraw;
  void onDeclineDraw;

  const onResign = () => {
    if (!canResign || isGameEnded) return;
    if (settings.gameMode === 'computer' && engineSide !== null) {
      const human: 'w' | 'b' = engineSide === 'w' ? 'b' : 'w';
      setResignPrompt({ side: human });
    } else {
      setResignPrompt({ side: game.turn() });
    }
  };
  const confirmResign = () => {
    if (!resignPrompt) return;
    setGameEndReason({ kind: 'resign', side: resignPrompt.side });
    setResignPrompt(null);
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
      engineRequestEval(fen, settings.engineLevel, settings.thinkTime);
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

  // Compact status text. Just the side-to-move and a short
  // game-end summary. Player names, ratings, and opening names
  // are surfaced in the side-panel move list header so the status
  // bar can stay a single fixed-height line.
  const statusText = (() => {
    if (gameEndReason?.kind === 'draw') return 'Draw';
    if (gameEndReason?.kind === 'resign') {
      return `${gameEndReason.side === 'w' ? 'White' : 'Black'} resigns`;
    }
    if (clockEnabled && clock.winner) {
      return `${clock.winner === 'w' ? 'White' : 'Black'} wins on time`;
    }
    if (snapshot.isCheckmate) {
      return `Checkmate — ${snapshot.turn === 'w' ? 'Black' : 'White'} wins`;
    }
    if (snapshot.isStalemate) return 'Stalemate';
    if (snapshot.isDraw) return 'Draw';
    if (drawOffer && settings.gameMode === 'local') {
      return `${drawOffer === 'w' ? 'White' : 'Black'} offers a draw`;
    }
    if (settings.gameMode === 'analysis') {
      return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`;
    }
    if (settings.gameMode === 'computer' && engineSide !== null) {
      const side = snapshot.turn === engineSide ? 'Computer' : 'You';
      return `${side} to move`;
    }
    return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`;
  })();

  const bottomSide: 'w' | 'b' = orientation;
  const topSide: 'w' | 'b' = orientation === 'w' ? 'b' : 'w';

  // Active right-sidebar tab. Mirrors the chess.com analysis layout
  // (Move List / Engine Lines / Move Times). Kept here so the JSX
  // stays in one place.
  const [sidebarTab, setSidebarTab] = useState<'moves' | 'analysis' | 'times'>(
    'moves',
  );

  return (
    <div
      className={`app ${isReviewMode ? 'review-mode' : ''} ${boardFullscreen ? 'board-fullscreen' : ''}`}
    >
      {/* === Top bar: game title + action buttons === */}
      <header className="cc-topbar">
        <div className="cc-topbar-left">
          <button className="cc-icon-btn" onClick={onFlip} title="Flip the board">
            <span className="icon-font-chess repeat" />
          </button>
        </div>
        <div className="cc-topbar-center">
          <div className="cc-game-title">
            {lichessHeaders?.White && lichessHeaders?.Black ? (
              <span className="cc-game-players">
                {lichessHeaders.White}
                {lichessHeaders.whiteRating && (
                  <span className="cc-game-rating"> ({lichessHeaders.whiteRating})</span>
                )}
                <span className="cc-game-vs">vs</span>
                {lichessHeaders.Black}
                {lichessHeaders.blackRating && (
                  <span className="cc-game-rating"> ({lichessHeaders.blackRating})</span>
                )}
                {lichessHeaders.Result && (
                  <span className="cc-game-result"> · {lichessHeaders.Result}</span>
                )}
              </span>
            ) : (
              <span className="cc-game-players">
                {topSide === 'w' ? 'White' : 'Black'} vs {bottomSide === 'w' ? 'White' : 'Black'}
              </span>
            )}
            {(lichessHeaders?.Opening || moveClassifications.openingName) && (
              <div className="cc-game-opening">
                {lichessHeaders?.Opening ?? moveClassifications.openingName}
              </div>
            )}
          </div>
        </div>
        <div className="cc-topbar-right">
          {!isLivePlay && (
            <button className="cc-topbar-btn" onClick={() => setNewGameOpen(true)}>New Game</button>
          )}
          {!isLivePlay && (
            <button className="cc-topbar-btn" onClick={() => setLichessOpen(true)} title="Import a game from Lichess">
              <span className="icon-font-chess lichess" aria-hidden="true">🦊</span> Import
            </button>
          )}
          <button className="cc-icon-btn" onClick={() => setBoardFullscreen((v) => !v)} title={boardFullscreen ? 'Exit fullscreen' : 'Expand board'}>
            {boardFullscreen ? '⤡' : '⤢'}
          </button>
          {isLivePlay && (
            <button className="cc-topbar-btn" onClick={onUndo} disabled={settings.gameMode !== 'computer' || fullHistory.length === 0 || animatingMove !== null || isGameEnded}>
              Undo
            </button>
          )}
          <button className="cc-topbar-btn primary" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <span className="icon-font-chess circle-gearwheel" />
          </button>
        </div>
      </header>

      <main className="cc-main">
        <div className="cc-board-area">
          {/* === Board column: top player + board + bottom player === */}
          <div className="cc-board-column">
            {/* Top player bar (clock, name, captures) */}
            <div className="cc-player-strip top">
              {clockEnabled && (
                <ClockDisplay
                  side={topSide}
                  seconds={topSide === 'w' ? clock.whiteSeconds : clock.blackSeconds}
                  active={clock.running === topSide}
                  label={topSide === 'w' ? 'White' : 'Black'}
                />
              )}
              <div
                className={`cc-player-name cc-player-${topSide === 'w' ? 'white' : 'black'}`}
              >
                <span className="cc-player-username">
                  {topSide === 'w'
                    ? lichessHeaders?.White ?? 'White'
                    : lichessHeaders?.Black ?? 'Black'}
                </span>
                <span className="cc-player-rating">
                  {topSide === 'w'
                    ? lichessHeaders?.whiteRating
                      ? `(${lichessHeaders.whiteRating})`
                      : ''
                    : lichessHeaders?.blackRating
                      ? `(${lichessHeaders.blackRating})`
                      : ''}
                </span>
                <CapturedRow captures={captures} side={topSide} />
              </div>
            </div>

            {/* Board + eval bar */}
            <div className="cc-board-frame">
              <div className="cc-board-wrap">
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
                  onClearPreMoves={onClearPreMoves}
                  hasPreMoves={preMoveQueue.length > 0 || pendingPreMoveFrom !== null}
                  onSquareClick={handleSquareClick}
                  onPieceDragStart={handlePieceDragStart}
                  onDragOverSquare={() => {}}
                  onDropOnSquare={handleDropOnSquare}
                  onDragEnd={handleDragEnd}
                  onAnimationDone={() => setAnimatingMove(null)}
                />
                {showEvalBar && (
                  <div className="cc-eval-bar-wrap">
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
                  </div>
                )}
              </div>
            </div>

            {/* Bottom player bar */}
            <div className="cc-player-strip bottom">
              <div
                className={`cc-player-name cc-player-${bottomSide === 'w' ? 'white' : 'black'}`}
              >
                <span className="cc-player-username">
                  {bottomSide === 'w'
                    ? lichessHeaders?.White ?? 'White'
                    : lichessHeaders?.Black ?? 'Black'}
                </span>
                <span className="cc-player-rating">
                  {bottomSide === 'w'
                    ? lichessHeaders?.whiteRating
                      ? `(${lichessHeaders.whiteRating})`
                      : ''
                    : lichessHeaders?.blackRating
                      ? `(${lichessHeaders.blackRating})`
                      : ''}
                </span>
                <CapturedRow captures={captures} side={bottomSide} />
              </div>
              {clockEnabled && (
                <ClockDisplay
                  side={bottomSide}
                  seconds={bottomSide === 'w' ? clock.whiteSeconds : clock.blackSeconds}
                  active={clock.running === bottomSide}
                  label={bottomSide === 'w' ? 'White' : 'Black'}
                />
              )}
            </div>

            {/* Status pill: turn / check / checkmate / draw */}
            <div
              className={`cc-status-pill${snapshot.inCheck ? ' check' : ''}`}
              data-status={statusText}
            >
              {statusText}
            </div>
          </div>

          {/* === Right sidebar === */}
          <aside className="cc-sidebar">
            {fullHistory.length > 0 ? (
              <>
                <div className="cc-sidebar-tabs" role="tablist">
                  <button role="tab" aria-selected={sidebarTab === 'moves'} className={`cc-tab${sidebarTab === 'moves' ? ' active' : ''}`} onClick={() => setSidebarTab('moves')}>Move list</button>
                  <button role="tab" aria-selected={sidebarTab === 'analysis'} className={`cc-tab${sidebarTab === 'analysis' ? ' active' : ''}`} onClick={() => setSidebarTab('analysis')}>Analysis</button>
                  <button role="tab" aria-selected={sidebarTab === 'times'} className={`cc-tab${sidebarTab === 'times' ? ' active' : ''}`} onClick={() => setSidebarTab('times')}>Move times</button>
                </div>

                {sidebarTab === 'moves' && (
                  <div className="cc-sidebar-section cc-move-list">
                    <div className="cc-moves-nav">
                      <button className="cc-nav-btn" onClick={onJumpStart} disabled={viewPly <= 0} aria-label="Jump to start" title="Jump to start">⏮</button>
                      <button className="cc-nav-btn" onClick={onJumpBack} disabled={viewPly <= 0} aria-label="Step back" title="Step back (←)">◀</button>
                      <button className="cc-nav-btn" onClick={onJumpForward} disabled={viewPly >= fullHistory.length} aria-label="Step forward" title="Step forward (→)">▶</button>
                      <button className="cc-nav-btn" onClick={onJumpEnd} disabled={viewPly >= fullHistory.length} aria-label="Jump to end" title="Jump to end">⏭</button>
                    </div>
                    <MoveHistory history={fullHistory} sanMoves={moveHistorySANS} currentPly={viewPly} onJumpTo={onJumpTo} classifications={moveClassifications.classifications} moveTimes={moveTimes} bulkProgress={moveClassifications.bulkLoading ? { done: moveClassifications.evaluatedPlies, total: moveClassifications.totalPlies } : null} />
                  </div>
                )}

                {sidebarTab === 'analysis' && (
                  <div className="cc-sidebar-section cc-analysis">
                    <div className="cc-engine-status">
                      {engine.status === 'ready' ? `Engine ready · depth ${engine.bestLine?.depth ?? '—'}` : engine.status === 'thinking' ? 'Engine thinking…' : engine.status === 'error' ? 'Engine offline' : 'Engine idle'}
                    </div>
                    {engine.bestLine && engine.bestLine.pv.length > 0 && (
                      <div className="cc-engine-line">
                        <div className="cc-engine-line-label">Best line</div>
                        <div className="cc-engine-line-pv">{engine.bestLine.pv.join(' ')}</div>
                      </div>
                    )}
                  </div>
                )}

                {sidebarTab === 'times' && (
                  <div className="cc-sidebar-section cc-times">
                    {moveTimes.length <= 1 ? (
                      <div className="cc-empty">No time data — play a clocked game.</div>
                    ) : (
                      <div className="cc-time-list">
                        {moveTimes.slice(1).map((t, i) => (
                          <div key={i} className={`cc-time-row ${i + 1 === viewPly ? 'current' : ''}`} onClick={() => jumpToPly(i + 1)}>
                            <span className="cc-time-ply">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'}</span>
                            <span className="cc-time-secs">{t.toFixed(1)}s</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="cc-sidebar-landing">
                <div className="cc-landing-title">New Game</div>
                <div className="cc-landing-modes">
                  <button className="cc-landing-btn" onClick={() => { setNewGameOpen(true); }}>
                    <span className="cc-landing-icon">👤</span>
                    <span className="cc-landing-label">2 Players</span>
                    <span className="cc-landing-hint">Play offline</span>
                  </button>
                  <button className="cc-landing-btn" onClick={() => { setNewGameOpen(true); }}>
                    <span className="cc-landing-icon">🤖</span>
                    <span className="cc-landing-label">vs Computer</span>
                    <span className="cc-landing-hint">Stockfish engine</span>
                  </button>
                  <button className="cc-landing-btn" onClick={() => { setNewGameOpen(true); }}>
                    <span className="cc-landing-icon">📊</span>
                    <span className="cc-landing-label">Analysis</span>
                    <span className="cc-landing-hint">No clock, no opponent</span>
                  </button>
                </div>
                <div className="cc-landing-divider" />
                <button className="cc-landing-import" onClick={() => setLichessOpen(true)}>
                  <span className="icon-font-chess lichess" aria-hidden="true">🦊</span> Import from Lichess
                </button>
                <div className="cc-landing-divider" />
                <button className="cc-landing-settings" onClick={() => setSettingsOpen(true)}>
                  <span className="icon-font-chess circle-gearwheel" /> Game Settings
                </button>
              </div>
            )}

            {fullHistory.length > 0 && (
              <div className="cc-sidebar-footer">
                <div className="cc-arrow-toolbar">
                  <span className="cc-arrow-label">ARROW</span>
                  {(['green', 'red', 'yellow', 'blue'] as ArrowColor[]).map((c) => (
                    <button key={c} type="button" className={`cc-arrow-swatch cc-arrow-${c}${arrowColor === c ? ' selected' : ''}`} aria-label={`${c} arrow`} title={`${c[0].toUpperCase()}${c.slice(1)} arrow`} onClick={() => setArrowColor(c)} />
                  ))}
                  <button type="button" className="cc-arrow-clear" onClick={onClearArrows} disabled={arrows.length === 0} title="Clear all arrows (Esc)">Clear</button>
                </div>

                {isLivePlay && !isGameEnded && (
                  <div className="cc-game-actions">
                    {canResign && <button className="cc-action-btn" onClick={onResign}><span className="cc-action-icon">⚑</span> Resign</button>}
                    {canOfferDraw && <button className="cc-action-btn" onClick={onOfferDraw}>🤝 Offer Draw</button>}
                  </div>
                )}

                {isGameEnded && !isReviewMode && <button className="cc-review-btn" onClick={onReview}><span className="cc-action-icon">↻</span> Game Review</button>}
                {isReviewMode && <button className="cc-review-btn" onClick={onExitReview}>Back to result</button>}

                {preMovesEnabled && (queuedCount > 0 || pendingPreMoveFrom) && (
                  <div className="cc-premove-banner">
                    {queuedCount > 0 ? (
                      <span>Pre-move{queuedCount > 1 ? 's' : ''} queued{queuedCount > 1 ? ` (${queuedCount})` : ''}: {preMoveQueue.map((m) => `${m.from}→${m.to}`).join(', ')}{pendingPreMoveFrom && ` (+ ${pendingPreMoveFrom}→?)`} · right-click board to clear</span>
                    ) : (
                      <span>Pre-move from {pendingPreMoveFrom} — pick a destination (right-click to clear)</span>
                    )}
                  </div>
                )}

                {moveClassifications.bulkLoading && <div className="cc-premove-banner">Analyzing moves {moveClassifications.evaluatedPlies}/{moveClassifications.totalPlies}…</div>}
                {settings.gameMode === 'computer' && engine.status === 'loading' && <div className="cc-premove-banner cc-status-error">Engine offline — run: node scripts/stockfish-bridge.js</div>}
              </div>
            )}
          </aside>
        </div>
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
      {resignPrompt && (
        <ConfirmDialog
          title="Resign this game?"
          message={
            resignPrompt.side === 'w'
              ? 'You will lose as White. Are you sure?'
              : 'You will lose as Black. Are you sure?'
          }
          confirmLabel="Resign"
          confirmClass="danger-action"
          onConfirm={confirmResign}
          onCancel={() => setResignPrompt(null)}
        />
      )}
      {leavePrompt && (
        <ConfirmDialog
          title={leavePrompt === 'live' ? 'Leave this game?' : 'Replace this game?'}
          message={
            leavePrompt === 'live'
              ? 'A game is in progress. Your move time will continue if you come back.'
              : 'Loading a new game will replace the current one.'
          }
          confirmLabel="Continue"
          confirmClass="danger-action"
          onConfirm={() => {
            setLeavePrompt(null);
            if (leavePrompt === 'live') {
              // user confirmed leaving a live game; do nothing else
            }
          }}
          onCancel={() => setLeavePrompt(null)}
        />
      )}
    </div>
  );
}

export default App;
