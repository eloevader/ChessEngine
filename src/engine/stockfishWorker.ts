/// <reference lib="webworker" />
import STOCKFISH_URL from '../../public/engine/stockfish.js?url';
import STOCKFISH_WASM_URL from '../../public/engine/stockfish.wasm?url';

declare const self: DedicatedWorkerGlobalScope;

// stockfish.js determines the wasm URL from `self.location.hash`. We need to
// pass our wasm URL via the hash, with the format: `<wasm_url>,worker`.
const workerURL = `${STOCKFISH_URL}#${encodeURIComponent(STOCKFISH_WASM_URL)},worker`;

const engine: Worker = new Worker(workerURL);

engine.onmessage = (e: MessageEvent) => {
  postMessage(e.data);
};

engine.onerror = (e: ErrorEvent) => {
  postMessage(`error: ${e.message || 'engine failed'}`);
};

self.onmessage = (e: MessageEvent) => {
  engine.postMessage(e.data);
};
