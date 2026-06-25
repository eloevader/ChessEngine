import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { MoveHistory } from './components/MoveHistory';
import { PromotionDialog } from './components/PromotionDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { CapturedRow } from './components/CapturedPieces';
import { EvalBar } from './components/EvalBar';
import { ClockDisplay } from './components/ClockDisplay';
import { NewGameDialog } from './components/NewGameDialog';
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
import { useLastMoveThreats } from './chess/threats';
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

  // -------- Derived state --------
  const snapshot = game.snapshot();
  // Threats (red highlights) are shown whenever the user is in a non-playing
  // exploration mode — analysis (the default), or post-game review. They are
  // never shown during a live local / vs-computer game.
  const showThreatsNow =
    settings.showThreats &&
    (settings.gameMode === 'analysis' || reviewing);
  const threatenedSquares = useLastMoveThreats(fen, showThreatsNow, lastMove);
  const board = useMemo(() => buildBoard(fen), [fen]);
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

      if (settings.flipAfterMove) {
        setTimeout(
          () => setOrientation((o) => (o === 'w' ? 'b' : 'w')),
          ANIMATION_DURATIONS_MS[settings.animationSpeed],
        );
      }
      return result;
    },
    [clock, clockEnabled, emit, settings.animationSpeed, settings.flipAfterMove],
  );

  // -------- Click handling --------
  const canHumanMove = (): boolean => {
    if (pendingPromotion || animatingMove) return false;
    if (snapshot.isGameOver || gameEndReason) return false;
    if (settings.gameMode === 'analysis') return true; // free play in analysis
    if (
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      snapshot.turn === engineSide
    ) {
      return false;
    }
    return true;
  };

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!canHumanMove()) return;
      const piece = game.pieceAt(square);

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
    [selected, legalTargets, captureTargets, animatingMove, tryMove],
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
  };

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

  // -------- Undo (computer mode only) --------
  const onUndo = () => {
    if (animatingMove) return;
    if (settings.gameMode !== 'computer') return;
    if (fullHistory.length === 0) return;
    if (viewPly < fullHistory.length) jumpToPly(fullHistory.length);

    const newHistory = fullHistory.slice(0, -1);
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
  const onJumpForward = () => jumpToPly(Math.min(fullHistory.length, viewPly + 1));
  const onJumpEnd = () => jumpToPly(fullHistory.length);

  const onFlip = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  // -------- Game end / review --------
  const isGameEnded = !!(snapshot.isGameOver || gameEndReason);

  // Auto-stop engine if game ended
  useEffect(() => {
    if (isGameEnded) {
      void engineStop();
      clock.switchTo(null);
    }
  }, [isGameEnded, clock, engineStop]);

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
    jumpToPly(0);
  };

  // -------- Engine integration --------
  // The engine should think:
  //   - during analysis mode (anytime the user is exploring)
  //   - when the user is reviewing past moves (post-game review)
  //   - when it's the engine's turn in computer mode and game is ongoing
  const isEngineTurn =
    settings.gameMode === 'computer' &&
    engineSide !== null &&
    viewPly === fullHistory.length &&
    snapshot.turn === engineSide &&
    !isGameEnded &&
    !gameEndReason;
  const isEngineThinking =
    settings.gameMode === 'analysis' ||
    reviewing ||
    isEngineTurn;

  useEffect(() => {
    if (isEngineThinking) {
      engineRequestEval(fen, settings.engineLevel);
    } else {
      void engineStop();
    }
  }, [fen, isEngineThinking, engineRequestEval, engineStop, settings.engineLevel]);

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
    }
  }, [engineBestMove, settings.gameMode, engineSide, isGameEnded, gameEndReason, snapshot.turn, tryMove, engineClearBestMove]);

  // -------- Status text --------
  const showEvalBar = settings.evalBarEnabled && isEngineThinking;
  const isReviewMode = reviewing && isGameEnded;

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
    <div className="app">
      <main className="app-main">
        <div className="board-area">
          <header className="app-header">
            <h1>Chess Analyzer</h1>
          </header>
          <div className="status-bar" data-status={snapshot.inCheck ? 'check' : ''}>
            {statusText}
            {settings.gameMode === 'computer' && engine.status === 'thinking' && ' • thinking…'}
            {settings.gameMode === 'computer' && engine.status === 'loading' && ' • loading engine…'}
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
              scoreCp={engine.scoreCp}
              scoreMate={engine.scoreMate}
              showText
              orientation="horizontal"
              position="top"
              title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
            />
          )}
          <div className={`board-row eval-pos-${settings.evalBarPosition}`}>
            {showEvalBar && settings.evalBarPosition === 'left' && (
              <EvalBar
                scoreCp={engine.scoreCp}
                scoreMate={engine.scoreMate}
                showText
                orientation="vertical"
                position="left"
                title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
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
              threatenedSquares={threatenedSquares}
              onSquareClick={handleSquareClick}
              onPieceDragStart={handlePieceDragStart}
              onDragOverSquare={() => {}}
              onDropOnSquare={handleDropOnSquare}
              onDragEnd={handleDragEnd}
              onAnimationDone={() => setAnimatingMove(null)}
            />
            {showEvalBar && settings.evalBarPosition === 'right' && (
              <EvalBar
                scoreCp={engine.scoreCp}
                scoreMate={engine.scoreMate}
                showText
                orientation="vertical"
                position="right"
                title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
              />
            )}
          </div>
          {showEvalBar && settings.evalBarPosition === 'bottom' && (
            <EvalBar
              scoreCp={engine.scoreCp}
              scoreMate={engine.scoreMate}
              showText
              orientation="horizontal"
              position="bottom"
              title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
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
          {isGameEnded && !isReviewMode && (
            <div className="post-game-actions">
              <button className="primary-action" onClick={onReview}>
                Review
              </button>
            </div>
          )}
          {isReviewMode && (
            <div className="post-game-actions">
              <button onClick={() => setReviewing(false)}>Back to result</button>
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
          <div className="controls">
            <button onClick={() => setNewGameOpen(true)}>New Game</button>
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
            currentPly={viewPly - 1}
            onJumpTo={onJumpTo}
            onJumpStart={onJumpStart}
            onJumpBack={onJumpBack}
            onJumpForward={onJumpForward}
            onJumpEnd={onJumpEnd}
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
    </div>
  );
}

export default App;
