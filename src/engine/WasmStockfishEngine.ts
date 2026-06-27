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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
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
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      if (typeof SharedArrayBuffer !== 'function') {
        throw new Error(
          'SharedArrayBuffer is not available. The WASM engine requires ' +
          'Cross-Origin-Embedder-Policy: require-corp and ' +
          'Cross-Origin-Opener-Policy: same-origin headers. ' +
          'Switch to "Local bridge" or add the required headers.'
        );
      }

      await ensureScriptLoaded();
      while (typeof Stockfish === 'undefined') {
        await new Promise((r) => setTimeout(r, 50));
      }
      this.sf = Stockfish();

      // Safety timeout: if the wasm module never initializes (e.g. missing
      // headers, CORS issue), don't hang forever.
      const readyTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Stockfish.wasm initialization timed out after 10s')), 10000)
      );
      await Promise.race([this.sf.ready, readyTimeout]);

      this.sf.addMessageListener((line: string) => this.processLine(line));
      this.sf.postMessage('uci');
    } catch (err) {
      this.emit({ type: 'error', message: (err as Error).message });
      throw err;
    }
  }

  private processLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === 'uciok') {
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
    this.sf?.postMessage(parts.join(' '));
  }

  async stop(): Promise<void> {
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
