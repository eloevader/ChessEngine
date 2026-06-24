# Chess Analyzer

A free, open-source chess analyzer and trainer. Play locally, analyze with Stockfish, get Lichess-style position eval — no premium subscription.

## Features (current)

- Full 2-player local board with all rules (castling, en passant, promotion)
- Click-to-move and drag-and-drop
- Check / checkmate / stalemate detection
- Move history, FEN display, board flip
- Stockfish WASM engine + Lichess cloud eval (planned)

## Roadmap

- Real Stockfish analysis with eval bar
- Play vs computer with chess clock
- PGN import / export
- Puzzle mode (Lichess puzzle DB)
- Game-to-video export with brilliancy highlights

## Tech

- React 19 + TypeScript
- Vite
- [chess.js](https://github.com/jhlywa/chess.js) for move generation
- [Stockfish](https://stockfishchess.org/) WASM (single-threaded, works on GitHub Pages)
- Lichess cloud eval API

## Run locally

```bash
npm install
npm run dev
```

## Build & deploy

```bash
npm run deploy
```

Live at: <https://eloevader.github.io/ChessEngine/>

## License

MIT
