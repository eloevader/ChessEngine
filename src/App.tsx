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
import { useSettings, ANIMATION_DURATIONS_MS, setCommittedSettings } from './settings/SettingsStore';
import { useSound } from './settings/SoundManager';
import { getTheme, themeToCss } from './chess/themes';
import { useEngine } from './engine/useEngine';
import { useChessClock } from './chess/ChessClock';
import { useThreats } from './chess/threats';
import type { GameMode, PlayerSide, EngineLevel } from './settings/SettingsStore';
import './App.css';

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

function App() {
  const settings = useSettings();
  const { emit } = useSound();
  const engine = useEngine();
  const clock = useChessClock();

  const [fen, setFen] = useState(game.fen());
  const threats = useThreats(fen, settings.showThreats);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<Square>>(new Set());
  const [captureTargets, setCaptureTargets] = useState<Set<Square>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(null);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove>(null);
  const [settingsOpen, setSettingsOpen] = useState(settings.showSettingsOnStart);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [captures, setCaptures] = useState<{ white: Piece[]; black: Piece[] }>({ white: [], black: [] });
  /** Ply at which we are currently viewing (default = end of game). */
  const [viewPly, setViewPly] = useState<number>(0);
  /** Full move list (preserved when navigating so future moves aren't lost). */
  const [fullHistory, setFullHistory] = useState<string[]>([]);
  /** Side chosen for computer opponent (resolved at game start if 'random'). */
  const [engineSide, setEngineSide] = useState<'w' | 'b' | null>(null);
  /** Whether the game has a clock (and which side is the human in computer mode). */
  const [clockEnabled, setClockEnabled] = useState(false);

  const snapshot = game.snapshot();
  const board = useMemo(() => buildBoard(fen), [fen]);
  const kingInCheck = useMemo(() => {
    if (!snapshot.inCheck) return null;
    return findKingSquare(fen, snapshot.turn);
  }, [fen, snapshot.inCheck, snapshot.turn]);

  const sanMoves = useMemo<LegalMove[]>(() => {
    return fullHistory.map((san) => ({ san } as LegalMove));
  }, [fullHistory]);

  const theme = getTheme(settings.boardThemeId);
  const effectiveLight = settings.customLight ?? theme.light;
  const effectiveDark = settings.customDark ?? theme.dark;

  useEffect(() => {
    const css = themeToCss(theme);
    css['--light-sq'] = effectiveLight;
    css['--dark-sq'] = effectiveDark;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(css)) {
      root.style.setProperty(k, v);
    }
  }, [theme, effectiveLight, effectiveDark]);

  // Pick engine side at game start (handles 'random')
  useEffect(() => {
    if (settings.gameMode === 'computer' && engineSide === null) {
      const side =
        settings.playerSide === 'random'
          ? Math.random() < 0.5
            ? 'w'
            : 'b'
          : settings.playerSide === 'w'
            ? 'b'
            : 'w';
      setEngineSide(side);
    }
  }, [settings.gameMode, settings.playerSide, engineSide]);

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const piece = game.pieceAt(from);
      const captured = game.pieceAt(to);
      if (!piece) return null;
      const result = game.move(from, to, promotion);
      if (!result) {
        emit({ type: 'illegal' });
        return null;
      }
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

      // Clock: add increment to the side that just moved, then switch to opponent
      if (clockEnabled) {
        clock.addIncrement(result.color);
        const next = game.turn();
        clock.switchTo(next);
      }

      if (result.captured) {
        const capturedPiece: Piece = {
          color: result.color === 'w' ? 'b' : 'w',
          type: result.captured as Piece['type'],
        };
        setCaptures((prev) => {
          const key = capturedPiece.color === 'w' ? 'white' : 'black';
          return { ...prev, [key]: [...prev[key], capturedPiece] };
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
    [emit, settings.flipAfterMove, settings.animationSpeed, clock, clockEnabled],
  );

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (pendingPromotion || animatingMove) return;
      if (snapshot.isGameOver) return;

      // Block human moves if it's the engine's turn in computer mode
      if (settings.gameMode === 'computer' && engineSide !== null && game.turn() === engineSide) {
        return;
      }

      const piece = game.pieceAt(square);

      if (selected === null) {
        if (piece && piece.color === game.turn()) {
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
        return;
      }

      if (square === selected) {
        setSelected(null);
        setLegalTargets(new Set());
        setCaptureTargets(new Set());
        return;
      }

      if (legalTargets.has(square) || captureTargets.has(square)) {
        const fromPiece = game.pieceAt(selected);
        const isPromotion = fromPiece?.type === 'p' && (square[1] === '1' || square[1] === '8');
        if (isPromotion) {
          setPendingPromotion({ from: selected, to: square, color: fromPiece!.color });
          return;
        }
        tryMove(selected, square);
        setSelected(null);
        setLegalTargets(new Set());
        setCaptureTargets(new Set());
        return;
      }

      if (piece && piece.color === game.turn()) {
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
        return;
      }

      setSelected(null);
      setLegalTargets(new Set());
      setCaptureTargets(new Set());
    },
    [selected, legalTargets, captureTargets, snapshot.isGameOver, pendingPromotion, animatingMove, tryMove, settings.gameMode, engineSide],
  );

  const handlePieceDragStart = useCallback(
    (from: Square, piece: Piece) => {
      if (animatingMove) return;
      if (snapshot.isGameOver) return;
      if (piece.color !== game.turn()) return;
      if (settings.gameMode === 'computer' && engineSide !== null && game.turn() === engineSide) return;
      setSelected(from);
      const moves = game.legalMovesFrom(from);
      const targets = new Set<Square>();
      const captures = new Set<Square>();
      for (const m of moves) {
        if (m.isCapture) captures.add(m.to as Square);
        else targets.add(m.to as Square);
      }
      setLegalTargets(targets);
      setCaptureTargets(captures);
    },
    [snapshot.isGameOver, animatingMove, settings.gameMode, engineSide],
  );

  const handleDropOnSquare = useCallback(
    (to: Square) => {
      if (animatingMove) return;
      if (!selected) return;
      if (!legalTargets.has(to) && !captureTargets.has(to)) {
        setSelected(null);
        setLegalTargets(new Set());
        setCaptureTargets(new Set());
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
      setSelected(null);
      setLegalTargets(new Set());
      setCaptureTargets(new Set());
    },
    [selected, legalTargets, captureTargets, animatingMove, tryMove],
  );

  const handleDragEnd = useCallback(() => {
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
  }, []);

  const onChoosePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
  };

  const onCancelPromotion = () => setPendingPromotion(null);

  const _onReset = () => {
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
  };
  void _onReset;

  /** Manually-set end-of-game reason (resign / draw agreement). null means no
   *  manual end; falls back to chess.js status. */
  const [gameEndReason, setGameEndReason] = useState<
    | { kind: 'resign'; side: 'w' | 'b' }
    | { kind: 'draw' }
    | null
  >(null);
  /** In 2-player mode, true if a draw has been offered by the current player. */
  const [drawOffer, setDrawOffer] = useState<'w' | 'b' | null>(null);

  const onOfferDraw = () => {
    if (snapshot.isGameOver || gameEndReason) return;
    if (settings.gameMode === 'computer' && engineSide !== null) {
      // In computer mode, automatically decline (we don't have a real engine accept)
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
    if (snapshot.isGameOver || gameEndReason) return;
    if (settings.gameMode === 'computer' && engineSide !== null) {
      // Human side resigns
      const human: 'w' | 'b' = engineSide === 'w' ? 'b' : 'w';
      setGameEndReason({ kind: 'resign', side: human });
    } else {
      // Local mode: the side that's about to move resigns
      setGameEndReason({ kind: 'resign', side: game.turn() });
    }
  };

  const onStartNewGame = (config: GameConfig) => {
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
    engine.clearBestMove();
    engine.stop();

    // Commit the new game settings so other components see the updated
    // gameMode/level/side immediately.
    setCommittedSettings({
      ...settings,
      gameMode: config.mode,
      engineLevel: (config.level ?? settings.engineLevel),
      playerSide: (config.side ?? settings.playerSide),
    });

    // Pick engine side
    let side: 'w' | 'b' | null = null;
    if (config.mode === 'computer') {
      if (config.side === 'random') {
        side = Math.random() < 0.5 ? 'w' : 'b';
      } else if (config.side === 'w') {
        side = 'b';
      } else {
        side = 'w';
      }
    }
    setEngineSide(side);

    // Set up clock
    const totalSeconds = config.timeMin * 60 + config.timeSec;
    if (totalSeconds > 0 || config.increment > 0) {
      clock.reset({ initialSeconds: totalSeconds, incrementSeconds: config.increment });
      setClockEnabled(true);
      clock.switchTo('w');
    } else {
      clock.reset({ initialSeconds: 0, incrementSeconds: 0 });
      setClockEnabled(false);
    }

    setNewGameOpen(false);
  };

  // Undo: only enabled in computer mode. Deletes the engine's last response
  // (and your last move) so the human can try a different move.
  const onUndo = () => {
    if (animatingMove) return;
    if (settings.gameMode !== 'computer') return;
    if (fullHistory.length === 0) return;

    // If we're viewing a past position, first jump back to the latest.
    if (viewPly < fullHistory.length) {
      jumpToPly(fullHistory.length);
    }

    // Truncate the last move (the engine's response)
    const newHistory = fullHistory.slice(0, -1);
    setFullHistory(newHistory);

    // Rebuild game state
    game.reset();
    const newCaptures = { white: [] as Piece[], black: [] as Piece[] };
    for (let i = 0; i < newHistory.length; i++) {
      const r = game.moveSan(newHistory[i]);
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

  const onFlip = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  // Jump to a specific ply. Reads from fullHistory so future moves are
  // preserved. Does NOT delete anything.
  const jumpToPly = (ply: number) => {
    if (animatingMove) return;
    const history = fullHistory;
    if (ply < 0) {
      game.reset();
      setFen(INITIAL_FEN);
      setViewPly(0);
      setLastMove(null);
      setSelected(null);
      return;
    }
    game.reset();
    for (let i = 0; i < ply && i < history.length; i++) {
      game.moveSan(history[i]);
    }
    setFen(game.fen());
    setViewPly(ply);
    // Show the last move of the jumped-to position for context
    if (ply > 0) {
      const allMoves = game.historyVerbose();
      const m = allMoves[allMoves.length - 1];
      if (m) {
        setLastMove({ from: m.from as Square, to: m.to as Square });
      } else {
        setLastMove(null);
      }
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

  // Analysis mode = reviewing a past position OR game is finished.
  // During live play (in computer or local mode), hide the eval bar so the
  // player isn't tempted to use engine hints.
  const isAnalysisMode = viewPly < fullHistory.length || snapshot.isGameOver;

  // Whether the engine should be thinking right now.
  // = reviewing past position, game over, or it's the engine's turn in computer mode.
  const isEngineThinking =
    isAnalysisMode ||
    (settings.gameMode === 'computer' &&
      engineSide !== null &&
      viewPly === fullHistory.length &&
      game.turn() === engineSide &&
      !snapshot.isGameOver &&
      !gameEndReason);

  useEffect(() => {
    if (isEngineThinking) {
      engine.requestEval(fen, settings.engineLevel);
    } else {
      engine.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, isEngineThinking]);

  // If we're at the latest ply, the engine is to move (computer mode) - let it think
  useEffect(() => {
    if (
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      viewPly === fullHistory.length &&
      game.turn() === engineSide &&
      !snapshot.isGameOver &&
      !engine.bestMove
    ) {
      // The fen-change effect already requested eval; just ensure the engine is thinking
      // The useEngine hook will set bestMove when done
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, engineSide, settings.gameMode, snapshot.isGameOver]);

  // When the engine reports a bestmove, apply it
  useEffect(() => {
    if (engine.bestMove && settings.gameMode === 'computer' && engineSide !== null && game.turn() === engineSide) {
      const m = engine.bestMove;
      engine.clearBestMove();
      const from = m.slice(0, 2) as Square;
      const to = m.slice(2, 4) as Square;
      const promo = m.length > 4 ? (m[4] as 'q' | 'r' | 'b' | 'n') : undefined;
      tryMove(from, to, promo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.bestMove]);

  useEffect(() => {
    if (snapshot.isGameOver) {
      setSelected(null);
      setLegalTargets(new Set());
      setCaptureTargets(new Set());
      clock.switchTo(null);
    }
  }, [snapshot.isGameOver, clock]);

  // Handle time-out: if the clock says one side ran out, declare the game over
  useEffect(() => {
    if (clock.winner && clockEnabled && !snapshot.isGameOver) {
      // The side that ran out is the loser. We don't have a chess.js hook for this,
      // but for now we just show the status. The board state is unchanged.
      // (We could mutate FEN, but the simplest is to show "Time out".)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.winner]);

  const isGameEnded = snapshot.isGameOver || gameEndReason !== null;

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
          {settings.evalBarEnabled && isAnalysisMode && settings.evalBarPosition === 'top' && (
            <EvalBar
              scoreCp={engine.scoreCp}
              scoreMate={engine.scoreMate}
              showText
              orientation="horizontal"
              position="top"
              title={engine.bestLine ? `Depth ${engine.bestLine.depth}` : 'Eval'}
            />
          )}
          <div
            className={`board-row eval-pos-${settings.evalBarPosition}`}
          >
            {settings.evalBarEnabled && isAnalysisMode && settings.evalBarPosition === 'left' && (
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
              threats={threats}
              onSquareClick={handleSquareClick}
              onPieceDragStart={handlePieceDragStart}
              onDragOverSquare={() => {}}
              onDropOnSquare={handleDropOnSquare}
              onDragEnd={handleDragEnd}
              onAnimationDone={() => setAnimatingMove(null)}
            />
            {settings.evalBarEnabled && isAnalysisMode && settings.evalBarPosition === 'right' && (
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
          {settings.evalBarEnabled && isAnalysisMode && settings.evalBarPosition === 'bottom' && (
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
              title={settings.gameMode === 'computer' ? 'Undo last move' : 'Undo only available vs Computer'}
            >
              Undo
            </button>
            <button onClick={onFlip}>Flip</button>
            {!drawOffer && !isGameEnded && (
              <button onClick={onOfferDraw} title="Offer a draw">
                Draw
              </button>
            )}
            {drawOffer && settings.gameMode === 'local' && (
              <>
                <button onClick={onAcceptDraw} className="primary-action">
                  Accept Draw
                </button>
                <button onClick={onDeclineDraw}>Decline</button>
              </>
            )}
            {!isGameEnded && (
              <button onClick={onResign} className="danger-action" title="Resign the game">
                Resign
              </button>
            )}
            <button onClick={() => setSettingsOpen(true)} aria-label="Open settings">
              Settings
            </button>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-panel-spacer" aria-hidden="true" />
          <MoveHistory
            history={fullHistory}
            sanMoves={sanMoves}
            currentPly={viewPly - 1}
            onJumpTo={(p) => onJumpTo(p)}
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
