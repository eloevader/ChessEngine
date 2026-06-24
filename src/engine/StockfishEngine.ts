export interface EngineLine {
  multipv: number;
  depth: number;
  seldepth: number;
  scoreCp: number | null;
  scoreMate: number | null;
  pv: string[];
  nps: number;
  timeMs: number;
  nodes: number;
}

export interface EngineOptions {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  multiPv?: number;
  threads?: number;
  hash?: number;
}

export type EngineListener = (msg: EngineMessage) => void;

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'bestmove'; move: string; ponder?: string }
  | { type: 'info'; lines: EngineLine[] }
  | { type: 'error'; message: string };

interface EngineState {
  worker: Worker | null;
  ready: boolean;
  initPromise: Promise<void> | null;
  initResolvers: Array<() => void>;
  listeners: EngineListener[];
  currentFen: string;
  level: EngineOptions['level'];
}

// Engine strength levels (time + skill) — level 1 weakest, 8 strongest
// Based on Lichess-style mapping.
export const LEVEL_CONFIG: Record<EngineOptions['level'], { skill: number; movetime: number; depth?: number }> = {
  1: { skill: 0, movetime: 100 },
  2: { skill: 3, movetime: 200 },
  3: { skill: 6, movetime: 400 },
  4: { skill: 10, movetime: 700 },
  5: { skill: 14, movetime: 1000 },
  6: { skill: 18, movetime: 1500 },
  7: { skill: 20, movetime: 2500 },
  8: { skill: 20, movetime: 4000, depth: 22 },
};

export class StockfishEngine {
  private state: EngineState = {
    worker: null,
    ready: false,
    initPromise: null,
    initResolvers: [],
    listeners: [],
    currentFen: '',
    level: 4,
  };

  isReady(): boolean {
    return this.state.ready;
  }

  onMessage(fn: EngineListener): () => void {
    this.state.listeners.push(fn);
    return () => {
      this.state.listeners = this.state.listeners.filter((l) => l !== fn);
    };
  }

  private emit(msg: EngineMessage) {
    this.state.listeners.forEach((l) => l(msg));
  }

  async init(): Promise<void> {
    if (this.state.worker) return;
    if (this.state.initPromise) return this.state.initPromise;

    this.state.initPromise = new Promise<void>((resolve) => {
      this.state.initResolvers.push(resolve);
      const worker = new Worker(new URL('./stockfishWorker.ts', import.meta.url));
      this.state.worker = worker;
      worker.onmessage = (e: MessageEvent) => this.handle(e.data);
      worker.onerror = (e) => {
        this.emit({ type: 'error', message: e.message || 'Engine error' });
      };
      worker.postMessage('uci');
    });

    return this.state.initPromise;
  }

  private handle(data: unknown) {
    const text = typeof data === 'string' ? data : '';
    if (!text) return;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) this.processLine(line);
  }

  private processLine(line: string) {
    if (line === 'uciok') {
      this.applyConfig();
      this.state.worker?.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      this.state.ready = true;
      const resolvers = this.state.initResolvers;
      this.state.initResolvers = [];
      resolvers.forEach((r) => r());
      this.emit({ type: 'ready' });
      return;
    }
    if (line.startsWith('bestmove')) {
      const parts = line.split(/\s+/);
      const move = parts[1] ?? '';
      const ponder = parts[3] ?? undefined;
      this.emit({ type: 'bestmove', move, ponder });
      return;
    }
    if (line.startsWith('info ')) {
      const parsed = parseInfo(line);
      if (parsed.length) this.emit({ type: 'info', lines: parsed });
    }
  }

  private applyConfig() {
    const w = this.state.worker;
    if (!w) return;
    w.postMessage('setoption name UCI_LimitStrength value false');
    const cfg = LEVEL_CONFIG[this.state.level];
    w.postMessage(`setoption name Skill Level value ${cfg.skill}`);
    w.postMessage('setoption name UCI_Elo value 1500');
  }

  setLevel(level: EngineOptions['level']) {
    this.state.level = level;
    if (this.state.ready) this.applyConfig();
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    await this.init();
    this.state.currentFen = fen;
    const moveStr = moves.length ? ' moves ' + moves.join(' ') : '';
    this.state.worker!.postMessage(`position fen ${fen}${moveStr}`);
  }

  async go(options: EngineOptions = { level: 4 }): Promise<void> {
    await this.init();
    this.setLevel(options.level);
    const cfg = LEVEL_CONFIG[options.level];
    const parts: string[] = ['go'];
    if (options.multiPv && options.multiPv > 1) parts.push(`multipv ${options.multiPv}`);
    parts.push(`movetime ${cfg.movetime}`);
    if (cfg.depth) parts.push(`depth ${cfg.depth}`);
    this.state.worker!.postMessage(parts.join(' '));
  }

  async stop(): Promise<void> {
    if (!this.state.worker) return;
    this.state.worker.postMessage('stop');
  }

  destroy() {
    this.state.worker?.terminate();
    this.state.worker = null;
    this.state.ready = false;
    this.state.initPromise = null;
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
