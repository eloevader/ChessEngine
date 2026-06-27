import type { EngineLine, EngineOptions, EngineMessage, EngineListener } from './StockfishEngine';
import { LEVEL_CONFIG } from './StockfishEngine';

const STOCKFISH_JS = '/ChessEngine/stockfish/stockfish.js';

declare const Stockfish: () => {
  ready: Promise<void>;
  addMessageListener: (fn: (line: string) => void) => void;
  removeMessageListener: (fn: (line: string) => void) => void;
  postMessage: (cmd: string) => void;
  terminate: () => void;
};

function log(...args: unknown[]) {
  console.log('[WasmEngine]', ...args);
}
function warn(...args: unknown[]) {
  console.warn('[WasmEngine]', ...args);
}
function error(...args: unknown[]) {
  console.error('[WasmEngine]', ...args);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      log('Script tag already in DOM, skipping load');
      resolve();
      return;
    }
    log('Creating script tag for', src);
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      log('Script loaded OK:', src);
      resolve();
    };
    s.onerror = () => {
      error('Script load FAILED:', src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

let scriptLoadPromise: Promise<void> | null = null;
function ensureScriptLoaded(): Promise<void> {
  if (!scriptLoadPromise) {
    scriptLoadPromise = loadScript(STOCKFISH_JS);
  }
  return scriptLoadPromise;
}

function checkWasmThreads(): boolean {
  log('--- Feature detection ---');
  const hasWebAssembly = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
  log('WebAssembly.validate:', hasWebAssembly);
  if (!hasWebAssembly) {
    warn('WebAssembly not available');
    return false;
  }

  const hasSharedArrayBuffer = typeof SharedArrayBuffer === 'function';
  log('SharedArrayBuffer:', hasSharedArrayBuffer);
  if (!hasSharedArrayBuffer) {
    warn('SharedArrayBuffer not available — missing COOP/COEP headers?');
    return false;
  }

  const hasAtomics = typeof Atomics === 'object';
  log('Atomics:', hasAtomics);
  if (!hasAtomics) {
    warn('Atomics not available');
    return false;
  }

  try {
    const mem = new WebAssembly.Memory({ shared: true, initial: 1, maximum: 2 });
    const ok = mem.buffer instanceof SharedArrayBuffer;
    log('Shared WebAssembly.Memory:', ok);
    if (!ok) {
      warn('Shared memory allocation failed');
      return false;
    }
  } catch (e) {
    warn('WebAssembly.Memory({shared: true}) threw:', (e as Error).message);
    return false;
  }

  log('All feature checks PASSED');
  return true;
}

export class WasmStockfishEngine {
  private sf: ReturnType<typeof Stockfish> | null = null;
  private ready = false;
  private listeners: EngineListener[] = [];
  private initPromise: Promise<void> | null = null;
  private level: EngineOptions['level'] = 4;

  isReady(): boolean {
    return this.ready;
  }

  onMessage(fn: EngineListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(msg: EngineMessage): void {
    for (const fn of this.listeners) fn(msg);
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      log('init() already in progress, returning existing promise');
      return this.initPromise;
    }
    log('init() called');
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      log('--- WASM engine init start ---');

      if (!checkWasmThreads()) {
        throw new Error(
          'WASM threading not supported. The stockfish.wasm engine requires ' +
          'Cross-Origin-Embedder-Policy: require-corp and ' +
          'Cross-Origin-Opener-Policy: same-origin headers on the deployment. ' +
          'Fall back to "Local bridge" in Settings, or deploy to a platform ' +
          'that supports these headers (Netlify, Cloudflare Pages, Vercel).'
        );
      }

      log('Loading stockfish.js script...');
      await ensureScriptLoaded();
      log('Script loading complete');

      let waited = 0;
      while (typeof Stockfish === 'undefined') {
        await new Promise((r) => setTimeout(r, 50));
        waited += 50;
        if (waited >= 5000) {
          throw new Error('Stockfish global not defined after 5s');
        }
      }
      log('Stockfish global found after', waited, 'ms');

      log('Calling Stockfish()...');
      this.sf = Stockfish();
      log('Stockfish() returned, sf.ready is a Promise');
      log('Waiting for sf.ready (WASM module init)...');

      const readyTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('sf.ready timed out after 15s')), 15000)
      );
      await Promise.race([this.sf.ready, readyTimeout]);
      log('sf.ready RESOLVED — WASM module initialized');

      log('Setting up addMessageListener...');
      this.sf.addMessageListener((line: string) => {
        log('UCI output:', line.trim());
        this.processLine(line);
      });

      log('Sending "uci" command');
      this.sf.postMessage('uci');
      log('--- Engine init complete, waiting for uciok ---');
    } catch (err) {
      error('_init() failed:', (err as Error).message);
      this.emit({ type: 'error', message: (err as Error).message });
      throw err;
    }
  }

  private processLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === 'uciok') {
      log('Received uciok — sending options + isready');
      if (!this.sf) return;
      this.sf.postMessage('setoption name Threads value 2');
      this.sf.postMessage('setoption name Hash value 64');
      this.sf.postMessage('setoption name UCI_LimitStrength value false');
      this.sf.postMessage('setoption name UCI_Elo value 1500');
      this.sf.postMessage('setoption name Skill Level value ' + LEVEL_CONFIG[this.level].skill);
      this.sf.postMessage('isready');
      return;
    }

    if (trimmed === 'readyok') {
      log('Received readyok — engine is READY');
      if (!this.ready) {
        this.ready = true;
        this.emit({ type: 'ready' });
      }
      return;
    }

    if (trimmed.startsWith('bestmove ')) {
      const parts = trimmed.split(/\s+/);
      const move = parts[1] ?? '';
      const ponder = parts[3];
      log('Received bestmove:', move, ponder ? '(ponder: ' + ponder + ')' : '');
      this.emit({ type: 'bestmove', move, ponder });
      return;
    }

    if (trimmed.startsWith('info ')) {
      const parsed = parseInfo(trimmed);
      if (parsed.length) this.emit({ type: 'info', lines: parsed });
      return;
    }
  }

  setLevel(level: EngineOptions['level']) {
    this.level = level;
    if (this.ready && this.sf) {
      log('Setting skill level to', level);
      this.sf.postMessage('setoption name Skill Level value ' + LEVEL_CONFIG[level].skill);
    }
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    await this.init();
    const moveStr = moves.length ? ' moves ' + moves.join(' ') : '';
    this.sf?.postMessage('position fen ' + fen + moveStr);
  }

  async go(options: EngineOptions = { level: 4 }): Promise<void> {
    await this.init();
    this.setLevel(options.level);
    const cfg = LEVEL_CONFIG[options.level];
    const movetime = options.movetimeOverride ?? cfg.movetime;
    const parts: string[] = ['go'];
    if (options.multiPv && options.multiPv > 1) parts.push('multipv ' + options.multiPv);
    parts.push('movetime ' + movetime);
    if (!options.movetimeOverride && cfg.depth) parts.push('depth ' + cfg.depth);
    log('Sending go:', parts.join(' '));
    this.sf?.postMessage(parts.join(' '));
  }

  async stop(): Promise<void> {
    log('Sending stop');
    this.sf?.postMessage('stop');
  }

  async evalOnce(
    fen: string,
    movetime: number,
    multiPv: number = 1,
  ): Promise<{ bestMove: string; scoreCp: number | null; scoreMate: number | null; lines?: EngineLine[] }> {
    await this.init();
    await this.stop();
    return new Promise((resolve) => {
      let resolved = false;
      const allLines: EngineLine[] = [];
      const off = this.onMessage((msg) => {
        if (msg.type === 'info' && msg.lines.length > 0) {
          for (const l of msg.lines) {
            const existing = allLines.findIndex((e) => e.multipv === l.multipv);
            if (existing >= 0) allLines[existing] = l;
            else allLines.push(l);
          }
        } else if (msg.type === 'bestmove') {
          if (resolved) return;
          resolved = true;
          off();
          const pv1 = allLines.find((l) => l.multipv === 1) ?? allLines[0] ?? null;
          resolve({
            bestMove: msg.move,
            scoreCp: pv1?.scoreCp ?? null,
            scoreMate: pv1?.scoreMate ?? null,
            lines: multiPv > 1 ? allLines : undefined,
          });
        }
      });
      this.setPosition(fen).catch(() => {});
      if (multiPv > 1) {
        this.sf?.postMessage('setoption name MultiPV value ' + multiPv);
      }
      this.sf?.postMessage('go movetime ' + movetime);
      window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        off();
        const pv1 = allLines.find((l) => l.multipv === 1) ?? allLines[0] ?? null;
        resolve({
          bestMove: pv1?.pv?.[0] ?? '',
          scoreCp: pv1?.scoreCp ?? null,
          scoreMate: pv1?.scoreMate ?? null,
          lines: multiPv > 1 ? allLines : undefined,
        });
      }, movetime + 1500);
    });
  }

  destroy(): void {
    log('Destroying engine');
    this.sf?.terminate();
    this.sf = null;
    this.ready = false;
    this.listeners = [];
    this.initPromise = null;
  }
}

function parseInfo(line: string): EngineLine[] {
  const tokens = line.split(/\s+/);
  const get = (k: string) => {
    const i = tokens.indexOf(k);
    return i >= 0 ? tokens[i + 1] : undefined;
  };
  const depth = parseInt(get('depth') ?? '0', 10);
  const seldepth = parseInt(get('seldepth') ?? '0', 10);
  const multipv = parseInt(get('multipv') ?? '1', 10);
  const nps = parseInt(get('nps') ?? '0', 10);
  const timeMs = parseInt(get('time') ?? '0', 10);
  const nodes = parseInt(get('nodes') ?? '0', 10);
  const scoreIdx = tokens.indexOf('score');
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;
  if (scoreIdx >= 0) {
    if (tokens[scoreIdx + 1] === 'cp') scoreCp = parseInt(tokens[scoreIdx + 2], 10);
    if (tokens[scoreIdx + 1] === 'mate') scoreMate = parseInt(tokens[scoreIdx + 2], 10);
  }
  const pvIdx = tokens.indexOf('pv');
  const pv = pvIdx >= 0 ? tokens.slice(pvIdx + 1) : [];
  return [{ multipv, depth, seldepth, scoreCp, scoreMate, pv, nps, timeMs, nodes }];
}
