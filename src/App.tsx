import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { MoveHistory } from './components/MoveHistory';
import { PromotionDialog } from './components/PromotionDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { CapturedRow } from './components/CapturedPieces';
import { GameState, type LegalMove } from './chess/GameState';
import type { Piece, Square } from './chess/types';
import { useSettings, ANIMATION_DURATIONS_MS } from './settings/SettingsStore';
import { useSound } from './settings/SoundManager';
import { getTheme, themeToCss } from './chess/themes';
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
  const [settings] = useSettings();
  const { emit } = useSound();
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

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const piece = game.pieceAt(from);
      const target = game.pieceAt(to);
      const captured = target;
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
      void captured;

      if (result.isCapture) emit({ type: 'capture', move: result });
      else emit({ type: 'move', move: result });

      const nextSnap = game.snapshot();
      if (nextSnap.isCheckmate) emit({ type: 'checkmate' });
      else if (nextSnap.isStalemate || nextSnap.isDraw) emit({ type: 'draw' });
      else if (nextSnap.inCheck) emit({ type: 'check' });

      if (settings.flipAfterMove) {
        setTimeout(() => setOrientation((o) => (o === 'w' ? 'b' : 'w')), ANIMATION_DURATIONS_MS[settings.animationSpeed]);
      }
      return result;
    },
    [emit, settings.flipAfterMove, settings.animationSpeed],
  );

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (pendingPromotion || animatingMove) return;
      if (snapshot.isGameOver) return;

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
    [selected, legalTargets, captureTargets, snapshot.isGameOver, pendingPromotion, animatingMove, tryMove],
  );

  const handlePieceDragStart = useCallback(
    (from: Square, piece: Piece) => {
      if (animatingMove) return;
      if (snapshot.isGameOver) return;
      if (piece.color !== game.turn()) return;
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
    [snapshot.isGameOver, animatingMove],
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
  };

  const onUndo = () => {
    if (animatingMove) return;
    const result = game.undo();
    if (result) {
      setFen(game.fen());
      setLastMove(null);
      if (result.isCapture && result.captured) {
        setCaptures((prev) => {
          const color = result.color === 'w' ? 'black' : 'white';
          const arr = prev[color];
          if (arr.length === 0) return prev;
          return { ...prev, [color]: arr.slice(0, -1) };
        });
      }
    }
  };

  const onFlip = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  const onJumpTo = (ply: number) => {
    if (animatingMove) return;
    game.reset();
    const captureState: { white: Piece[]; black: Piece[] } = { white: [], black: [] };
    for (let i = 0; i <= ply && i < snapshot.history.length; i++) {
      const r = game.moveSan(snapshot.history[i]);
      if (r && r.isCapture && r.captured) {
        const capturedColor = r.color === 'w' ? 'b' : 'w';
        const capturedPiece: Piece = {
          color: capturedColor,
          type: r.captured as Piece['type'],
        };
        captureState[capturedColor === 'w' ? 'white' : 'black'].push(capturedPiece);
      }
    }
    setFen(game.fen());
    setLastMove(null);
    setSelected(null);
    setCaptures(captureState);
  };

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
    if (snapshot.inCheck) return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move — Check`;
    return `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`;
  })();

  // The side currently at the bottom of the visual board
  const bottomSide: 'w' | 'b' = orientation;

  return (
    <div className="app">
      <main className="app-main">
        <div className="board-area">
          <header className="app-header">
            <h1>Chess Analyzer</h1>
          </header>
          <div className="status-bar" data-status={snapshot.inCheck ? 'check' : ''}>
            {statusText}
          </div>
          <CapturedRow
            captures={captures}
            side={bottomSide === 'w' ? 'b' : 'w'}
          />
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
            currentPly={snapshot.history.length - 1}
            onJumpTo={onJumpTo}
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
