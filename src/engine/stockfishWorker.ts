/// <reference lib="webworker" />
import STOCKFISH_URL from 'stockfish?url';

let engine: WebAssembly.Module | null = null;
let instance: WebAssembly.Instance | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

declare const self: DedicatedWorkerGlobalScope;

async function loadEngine(): Promise<void> {
  if (engine) return;
  const res = await fetch(STOCKFISH_URL);
  const buffer = await res.arrayBuffer();
  engine = await WebAssembly.compile(buffer);
}

function postOutput(ptr: number) {
  if (!instance) return;
  const mem = instance.exports.memory as WebAssembly.Memory;
  const view = new Uint8Array(mem.buffer);
  let str = '';
  let i = ptr;
  while (view[i] !== 0) {
    str += String.fromCharCode(view[i]);
    i++;
  }
  postMessage(str);
}

async function ensureInitialized() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await loadEngine();
    instance = await WebAssembly.instantiate(engine!, {
      output: { postMessage: postOutput },
    });
    const exports = instance.exports as unknown as { postMessage: (s: string) => void };
    exports.postMessage('uci');
    initialized = true;
  })();
  return initPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data as string;
  if (typeof data !== 'string') return;
  await ensureInitialized();
  if (instance) {
    const exports = instance.exports as unknown as { postMessage: (s: string) => void };
    exports.postMessage(data);
  }
};
