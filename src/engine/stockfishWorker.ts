/// <reference lib="webworker" />
import STOCKFISH_URL from '../../public/engine/stockfish.js?url';

declare const self: DedicatedWorkerGlobalScope;

// stockfish.js is a self-contained Web Worker. We load it as a sub-worker
// and proxy messages between it and the main thread.
const engine: Worker = new Worker(STOCKFISH_URL);

engine.onmessage = (e: MessageEvent) => {
  postMessage(e.data);
};

engine.onerror = (e: ErrorEvent) => {
  postMessage(`error: ${e.message || 'engine failed'}`);
};

self.onmessage = (e: MessageEvent) => {
  engine.postMessage(e.data);
};
