import { Chess, type Square as CJSquare, type Move as CJMove, type PieceSymbol as CJPieceSymbol } from 'chess.js';
import type { Square } from './types';

export interface LegalMove {
  from: Square;
  to: Square;
  flags: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
  color: 'w' | 'b';
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
}

export interface PositionSnapshot {
  fen: string;
  turn: 'w' | 'b';
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isGameOver: boolean;
  isDraw: boolean;
  isInsufficientMaterial: boolean;
  isThreefoldRepetition: boolean;
  history: string[];
  pgn: string;
}

export class GameState {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  reset(): void {
    this.chess = new Chess();
  }

  fen(): string {
    return this.chess.fen();
  }

  pgn(): string {
    return this.chess.pgn();
  }

  turn(): 'w' | 'b' {
    return this.chess.turn();
  }

  history(): string[] {
    return this.chess.history();
  }

  inCheck(): boolean {
    return this.chess.inCheck();
  }

  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  isStalemate(): boolean {
    return this.chess.isStalemate();
  }

  isDraw(): boolean {
    return this.chess.isDraw();
  }

  isInsufficientMaterial(): boolean {
    return this.chess.isInsufficientMaterial();
  }

  isThreefoldRepetition(): boolean {
    return this.chess.isThreefoldRepetition();
  }

  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  pieceAt(square: Square): { type: CJPieceSymbol; color: 'w' | 'b' } | null {
    const p = this.chess.get(square as CJSquare);
    return p ? { type: p.type, color: p.color } : null;
  }

  legalMovesFrom(square: Square): LegalMove[] {
    const moves = this.chess.moves({ square: square as CJSquare, verbose: true }) as CJMove[];
    return moves.map((m) => this.toLegalMove(m));
  }

  legalMoves(): LegalMove[] {
    const moves = this.chess.moves({ verbose: true }) as CJMove[];
    return moves.map((m) => this.toLegalMove(m));
  }

  move(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): LegalMove | null {
    try {
      const result = this.chess.move({
        from: from as CJSquare,
        to: to as CJSquare,
        promotion,
      });
      return result ? this.toLegalMove(result) : null;
    } catch {
      return null;
    }
  }

  moveSan(san: string): LegalMove | null {
    try {
      const result = this.chess.move(san);
      return result ? this.toLegalMove(result) : null;
    } catch {
      return null;
    }
  }

  undo(): LegalMove | null {
    const result = this.chess.undo();
    return result ? this.toLegalMove(result) : null;
  }

  loadFen(fen: string): boolean {
    try {
      this.chess = new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }

  loadPgn(pgn: string): boolean {
    try {
      this.chess.loadPgn(pgn);
      return true;
    } catch {
      return false;
    }
  }

  snapshot(): PositionSnapshot {
    return {
      fen: this.fen(),
      turn: this.turn(),
      inCheck: this.inCheck(),
      isCheckmate: this.isCheckmate(),
      isStalemate: this.isStalemate(),
      isGameOver: this.isGameOver(),
      isDraw: this.isDraw(),
      isInsufficientMaterial: this.isInsufficientMaterial(),
      isThreefoldRepetition: this.isThreefoldRepetition(),
      history: this.history(),
      pgn: this.pgn(),
    };
  }

  private toLegalMove(m: CJMove): LegalMove {
    return {
      from: m.from,
      to: m.to,
      flags: m.flags,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      san: m.san,
      color: m.color,
      isCapture: m.flags.includes('c') || m.flags.includes('e'),
      isCastle: m.flags.includes('k') || m.flags.includes('q'),
      isEnPassant: m.flags.includes('e'),
      isPromotion: m.flags.includes('p'),
    };
  }
}
