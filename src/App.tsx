import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { MoveHistory } from './components/MoveHistory';
import { PromotionDialog } from './components/PromotionDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { CapturedRow } from './components/CapturedPieces';
import { EvalBar } from './components/EvalBar';
import { GameState, type LegalMove } from './chess/GameState';
import type { Piece, Square } from './chess/types';
import { useSettings, ANIMATION_DURATIONS_MS } from './settings/SettingsStore';
import { useSound } from './settings/SoundManager';
import { getTheme, themeToCss } from './chess/themes';
import { useEngine } from './engine/useEngine';
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

  const [fen, setFen] = useState(game.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<Square>>(new Set());
  const [captureTargets, setCaptureTargets] = useState<Set<Square>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(null);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove>(null);
  const [settingsOpen, setSettingsOpen] = useState(settings.showSettingsOnStart);
  const [captures, setCaptures] = useState<{ white: Piece[]; black: Piece[] }>({ white: [], black: [] });
  /** Ply at which we are currently viewing (default = end of game). */
  const [viewPly, setViewPly] = useState<number>(0);
  /** Side chosen for computer opponent (resolved at game start if 'random'). */
  const [engineSide, setEngineSide] = useState<'w' | 'b' | null>(null);

  const snapshot = game.snapshot();
  const board = useMemo(() => buildBoard(fen), [fen]);
  const kingInCheck = useMemo(() => {
    if (!snapshot.inCheck) return null;
    return findKingSquare(fen, snapshot.turn);
  }, [fen, snapshot.inCheck, snapshot.turn]);

  const sanMoves = useMemo<LegalMove[]>(() => {
    return snapshot.history.map((san) => ({ san } as LegalMove));
  }, [snapshot.history]);

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
    [emit, settings.flipAfterMove, settings.animationSpeed],
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

  const onReset = () => {
    game.reset();
    setFen(game.fen());
    setSelected(null);
    setLegalTargets(new Set());
    setCaptureTargets(new Set());
    setLastMove(null);
    setAnimatingMove(null);
    setCaptures({ white: [], black: [] });
    setViewPly(0);
    setEngineSide(null);
    engine.clearBestMove();
    engine.stop();
  };

  // Undo: delete the last move (and any subsequent move by the engine)
  const onUndo = () => {
    if (animatingMove) return;
    if (viewPly < snapshot.history.length) {
      // We're viewing a past position - undo means truncate forward
      const r = game.undo();
      if (r) {
        setFen(game.fen());
        setViewPly((v) => v - 1);
        if (r.isCapture && r.captured) {
          setCaptures((prev) => {
            const color = r.color === 'w' ? 'black' : 'white';
            const arr = prev[color];
            if (arr.length === 0) return prev;
            return { ...prev, [color]: arr.slice(0, -1) };
          });
        }
      }
    } else {
      // Truncate to before the last move
      const r = game.undo();
      if (r) {
        setFen(game.fen());
        setViewPly((v) => v - 1);
        if (r.isCapture && r.captured) {
          setCaptures((prev) => {
            const color = r.color === 'w' ? 'black' : 'white';
            const arr = prev[color];
            if (arr.length === 0) return prev;
            return { ...prev, [color]: arr.slice(0, -1) };
          });
        }
        setLastMove(null);
        engine.clearBestMove();
        engine.stop();
        // If computer mode, also undo the engine's response
        if (settings.gameMode === 'computer' && engineSide !== null && game.turn() === engineSide) {
          const r2 = game.undo();
          if (r2) {
            setFen(game.fen());
            setViewPly((v) => v - 1);
            if (r2.isCapture && r2.captured) {
              setCaptures((prev) => {
                const color = r2.color === 'w' ? 'black' : 'white';
                const arr = prev[color];
                if (arr.length === 0) return prev;
                return { ...prev, [color]: arr.slice(0, -1) };
              });
            }
          }
        }
      }
    }
  };

  const onFlip = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  // Jump to ply: only changes the viewing position, does NOT truncate future moves.
  // To actually truncate, the user must press Undo.
  const onJumpTo = (ply: number) => {
    if (animatingMove) return;
    const targetFen = (() => {
      if (ply < 0) return INITIAL_FEN;
      game.reset();
      for (let i = 0; i <= ply && i < snapshot.history.length; i++) {
        game.moveSan(snapshot.history[i]);
      }
      return game.fen();
    })();
    setFen(targetFen);
    setViewPly(ply);
    setLastMove(null);
    setSelected(null);
    engine.clearBestMove();
    engine.stop();
  };

  // Request engine eval when FEN or ply changes
  useEffect(() => {
    engine.requestEval(fen, settings.engineLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  // If we're at the latest ply, the engine is to move (computer mode) - let it think
  useEffect(() => {
    if (
      settings.gameMode === 'computer' &&
      engineSide !== null &&
      viewPly === snapshot.history.length &&
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
    }
  }, [snapshot.isGameOver]);

  const statusText = (() => {
    if (snapshot.isCheckmate) {
      return `Checkmate — ${snapshot.turn === 'w' ? 'Black' : 'White'} wins`;
    }
    if (snapshot.isStalemate) return 'Stalemate — Draw';
    if (snapshot.isInsufficientMaterial) return 'Draw — Insufficient material';
    if (snapshot.isThreefoldRepetition) return 'Draw — Threefold repetition';
    if (snapshot.isDraw) return 'Draw';
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
          <div className="board-row">
            {settings.evalBarEnabled && (
              <EvalBar
                scoreCp={engine.scoreCp}
                scoreMate={engine.scoreMate}
                showText
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
              onSquareClick={handleSquareClick}
              onPieceDragStart={handlePieceDragStart}
              onDragOverSquare={() => {}}
              onDropOnSquare={handleDropOnSquare}
              onDragEnd={handleDragEnd}
              onAnimationDone={() => setAnimatingMove(null)}
            />
          </div>
          <CapturedRow captures={captures} side={bottomSide} />
          <div className="controls">
            <button onClick={onReset}>New Game</button>
            <button onClick={onUndo} disabled={snapshot.history.length === 0 || animatingMove !== null}>
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
            history={snapshot.history}
            sanMoves={sanMoves}
            currentPly={viewPly - 1}
            onJumpTo={(p) => onJumpTo(p)}
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
    </div>
  );
}

export default App;
