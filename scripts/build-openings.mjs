#!/usr/bin/env node
/**
 * Build-time script: read the Lichess opening book TSV files
 * (a.tsv, b.tsv, ..., e.tsv) and emit a single JSON file with
 * every opening position (FEN) → opening name. We compute the
 * FEN by replaying the PGN moves from the initial position.
 *
 * Output: ../public/openings/book.json
 */

import { Chess } from 'chess.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENINGS_DIR = path.join(__dirname, '..', 'public', 'openings');
const OUTPUT_FILE = path.join(OPENINGS_DIR, 'book.json');

function parseTsvLine(line) {
  const parts = line.split('\t');
  if (parts.length < 3) return null;
  return { eco: parts[0], name: parts[1], pgn: parts[2] };
}

function pgnToMoves(pgn) {
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const moves = [];
  for (const tok of tokens) {
    if (/^\d+\.+$/.test(tok)) continue;
    if (/^\d+\.\.\.$/.test(tok)) continue;
    moves.push(tok);
  }
  return moves;
}

function main() {
  // FEN → name. We pick the most SPECIFIC (longest PGN) entry for
  // any given FEN, so "French Defense: Advance Variation" beats
  // the generic "French Defense" for a position that exists in
  // both. The book is a flat object — FEN is keyed without the
  // move counters / fullmove (we use the position-only FEN to be
  // tolerant of transpositions and engine position representations).
  const book = {};
  /** @type {Map<string, { name: string, eco: string, depth: number }>} */
  const bestForFen = new Map();

  for (const letter of ['a', 'b', 'c', 'd', 'e']) {
    const file = path.join(OPENINGS_DIR, `${letter}.tsv`);
    if (!fs.existsSync(file)) continue;
    const lines = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const row = parseTsvLine(lines[i]);
      if (!row) continue;
      const moves = pgnToMoves(row.pgn);
      const depth = moves.length;
      const chess = new Chess();
      // Add the FEN of every position along the line. The "best"
      // entry is the one with the largest depth (most specific
      // variation).
      const positions = [chess.fen()];
      for (const san of moves) {
        try {
          const result = chess.move(san);
          if (!result) break;
          positions.push(chess.fen());
        } catch {
          break;
        }
      }
      for (const fen of positions) {
        const cur = bestForFen.get(fen);
        if (!cur || cur.depth < depth) {
          bestForFen.set(fen, { name: row.name, eco: row.eco, depth });
        }
      }
    }
  }

  // Flatten to a FEN → name map. We store ONLY the name (not eco)
  // to keep the file small. The position-only FEN (no move
  // counters) is used as the key so we collapse to a single entry
  // per position regardless of whose turn / move number.
  for (const [fen, entry] of bestForFen) {
    const posFen = stripFen(fen);
    book[posFen] = entry.name;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(book));
  const size = fs.statSync(OUTPUT_FILE).size;
  console.log(
    `Wrote ${OUTPUT_FILE} (${(size / 1024).toFixed(1)} KB, ${Object.keys(book).length} positions)`,
  );
}

/** Strip the move counters and fullmove from a FEN, leaving just
 *  the position (pieces, side, castling, en passant, halfmove).
 *  This makes the book tolerant of small format differences. */
function stripFen(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

main();
