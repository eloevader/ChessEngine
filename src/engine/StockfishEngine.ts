export interface EngineLine {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  scoreMate: number | null;
  pv: string[];
  nps: number;
  timeMs: number;
}

export interface EngineOptions {
  depth?: number;
  multipv?: number;
  threads?: number;
  hash?: number;
}

export type EngineListener = (msg: EngineMessage) => void;

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'bestmove'; move: string }
  | { type: 'info'; lines: EngineLine[] }
  | { type: 'error'; message: string };

export class StockfishEngine {
  private worker: Worker | null = null;
  private listener: EngineListener | null = null;
  private ready = false;
  private readyResolvers: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(new URL('./stockfishWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent) => this.handle(e.data);
    this.worker.postMessage('uci');
    await this.waitReady();
  }

  onMessage(fn: EngineListener) {
    this.listener = fn;
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    this.ensure();
    this.worker!.postMessage(`position fen ${fen} moves ${moves.join(' ')}`.trim());
  }

  async go(options: EngineOptions = {}): Promise<void> {
    this.ensure();
    const parts: string[] = ['go'];
    if (options.depth) parts.push(`depth ${options.depth}`);
    else parts.push('depth 20');
    if (options.multipv) parts.push(`multipv ${options.multipv}`);
    this.worker!.postMessage(parts.join(' '));
  }

  async stop(): Promise<void> {
    this.ensure();
    this.worker!.postMessage('stop');
  }

  async setOption(name: string, value: number | string): Promise<void> {
    this.ensure();
    this.worker!.postMessage(`setoption name ${name} value ${value}`);
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  private ensure() {
    if (!this.worker) throw new Error('StockfishEngine not initialized. Call init() first.');
  }

  private waitReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  private handle(line: string) {
    if (line === 'uciok') {
      this.ready = true;
      this.readyResolvers.forEach((r) => r());
      this.readyResolvers = [];
      this.listener?.({ type: 'ready' });
      return;
    }
    if (line.startsWith('bestmove')) {
      const move = line.split(' ')[1] ?? '';
      this.listener?.({ type: 'bestmove', move });
      return;
    }
    if (line.startsWith('info ')) {
      const parsed = parseInfo(line);
      if (parsed.length) this.listener?.({ type: 'info', lines: parsed });
    }
  }
}

function parseInfo(line: string): EngineLine[] {
  const tokens = line.split(' ');
  const get = (k: string) => {
    const i = tokens.indexOf(k);
    return i >= 0 ? tokens[i + 1] : undefined;
  };
  const depth = parseInt(get('depth') ?? '0', 10);
  const nps = parseInt(get('nps') ?? '0', 10);
  const timeMs = parseInt(get('time') ?? '0', 10);
  const multipv = parseInt(get('multipv') ?? '1', 10);
  const lines: EngineLine[] = [];

  const scoreIdx = tokens.indexOf('score');
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;
  if (scoreIdx >= 0) {
    if (tokens[scoreIdx + 1] === 'cp') scoreCp = parseInt(tokens[scoreIdx + 2], 10);
    if (tokens[scoreIdx + 1] === 'mate') scoreMate = parseInt(tokens[scoreIdx + 2], 10);
  }
  const pvIdx = tokens.indexOf('pv');
  const pv = pvIdx >= 0 ? tokens.slice(pvIdx + 1) : [];

  lines.push({ multipv, depth, scoreCp, scoreMate, pv, nps, timeMs });
  return lines;
}
