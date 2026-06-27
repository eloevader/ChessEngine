// Stockfish bridge client. Opens a WebSocket to ws://localhost:8765
// (the stockfish-bridge.js server) and exposes a UCI-compatible
// interface: sendCommand() for any UCI string, onMessage() for every
// line the engine writes.

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
  | { type: 'error'; message: string }
  | { type: 'status'; status: 'connecting' | 'connected' | 'disconnected' };

// Engine strength levels (time + skill). Movetime is the *minimum*
// time Stockfish gets to think per move. We use a slightly higher
// floor than the raw "best for this level" because Stockfish at
// very short movetimes tends to play junk that gets stomped on
// the very next move, and the user sees a chaotic game. With these
// minimums the weakest level is still recognizable chess and the
// strongest has time to actually find good moves.
export const LEVEL_CONFIG: Record<
  EngineOptions['level'],
  { skill: number; movetime: number; depth?: number }
> = {
  1: { skill: 0, movetime: 1500 },
  2: { skill: 3, movetime: 1500 },
  3: { skill: 6, movetime: 2000 },
  4: { skill: 10, movetime: 2500 },
  5: { skill: 14, movetime: 3000 },
  6: { skill: 18, movetime: 4000 },
  7: { skill: 20, movetime: 5000 },
  8: { skill: 20, movetime: 7000, depth: 22 },
};

const DEFAULT_URL = 'ws://localhost:8765';

export class StockfishEngine {
  private ws: WebSocket | null = null;
  private ready = false;
  private listeners: EngineListener[] = [];
  private initPromise: Promise<void> | null = null;
  private initResolvers: Array<() => void> = [];
  private initRejecters: Array<(err: Error) => void> = [];
  private level: EngineOptions['level'] = 4;
  private commandQueue: string[] = [];
  private url: string;
  private reconnectTimer: number | null = null;

  constructor(url: string = DEFAULT_URL) {
    this.url = url;
  }

  isReady(): boolean {
    return this.ready;
  }

  onMessage(fn: EngineListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(msg: EngineMessage) {
    this.listeners.forEach((l) => l(msg));
  }

  async init(): Promise<void> {
    if (this.ws && this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.initResolvers.push(resolve);
      this.initRejecters.push(reject);
      this.connect();
    });

    return this.initPromise;
  }

  private connect() {
    this.emit({ type: 'status', status: 'connecting' });
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.failInit(new Error(`WebSocket connect failed: ${(err as Error).message}`));
      return;
    }
    this.ws.onopen = () => {
      this.emit({ type: 'status', status: 'connected' });
      // Send UCI handshake.
      this.sendRaw('uci');
    };
    this.ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) this.processLine(line);
    };
    this.ws.onerror = () => {
      // The 'error' event has no useful info. The 'close' event will
      // fire next with a code.
    };
    this.ws.onclose = () => {
      this.emit({ type: 'status', status: 'disconnected' });
      this.ready = false;
      this.ws = null;
      if (this.initPromise && this.initResolvers.length === 0) {
        // engine was previously ready; schedule a reconnect
        this.scheduleReconnect();
      } else if (this.initResolvers.length > 0) {
        this.failInit(
          new Error(
            'Could not connect to Stockfish bridge at ' +
              this.url +
              '. Make sure stockfish-bridge.js is running.',
          ),
        );
      }
    };
  }

  private failInit(err: Error) {
    const rejecters = this.initRejecters;
    this.initResolvers = [];
    this.initRejecters = [];
    this.initPromise = null;
    for (const r of rejecters) r(err);
    this.emit({ type: 'error', message: err.message });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.ready) this.init().catch(() => {});
    }, 2000);
  }

  private processLine(line: string) {
    if (line === 'uciok') {
      this.applyConfig();
      this.sendRaw('isready');
      return;
    }
    if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true;
        const resolvers = this.initResolvers;
        this.initResolvers = [];
        this.initRejecters = [];
        for (const r of resolvers) r();
        this.emit({ type: 'ready' });
        // Flush any commands queued before init.
        for (const cmd of this.commandQueue) this.sendRaw(cmd);
        this.commandQueue = [];
      }
      return;
    }
    if (line.startsWith('bestmove')) {
      const parts = line.split(/\s+/);
      const move = parts[1] ?? '';
      const ponder = parts[3];
      this.emit({ type: 'bestmove', move, ponder });
      return;
    }
    if (line.startsWith('info ')) {
      const parsed = parseInfo(line);
      if (parsed.length) this.emit({ type: 'info', lines: parsed });
      return;
    }
  }

  private applyConfig() {
    this.sendRaw('setoption name UCI_LimitStrength value false');
    this.sendRaw('setoption name UCI_Elo value 1500');
    const cfg = LEVEL_CONFIG[this.level];
    this.sendRaw(`setoption name Skill Level value ${cfg.skill}`);
  }

  setLevel(level: EngineOptions['level']) {
    this.level = level;
    if (this.ready) {
      this.sendRaw(`setoption name Skill Level value ${LEVEL_CONFIG[level].skill}`);
    }
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    await this.init();
    const moveStr = moves.length ? ' moves ' + moves.join(' ') : '';
    this.sendRaw(`position fen ${fen}${moveStr}`);
  }

  async go(options: EngineOptions = { level: 4 }): Promise<void> {
    await this.init();
    this.setLevel(options.level);
    const cfg = LEVEL_CONFIG[options.level];
    const parts: string[] = ['go'];
    if (options.multiPv && options.multiPv > 1) parts.push(`multipv ${options.multiPv}`);
    parts.push(`movetime ${cfg.movetime}`);
    if (cfg.depth) parts.push(`depth ${cfg.depth}`);
    this.sendRaw(parts.join(' '));
  }

  async stop(): Promise<void> {
    if (this.ws && this.ready) {
      this.sendRaw('stop');
    }
  }

  /** One-shot evaluation: ask the engine to think for `movetime`
   *  ms and resolve with the best move + score. Used by the move
   *  classifier to evaluate historical positions. */
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
          // Update the live set of lines.
          for (const l of msg.lines) {
            const existing = allLines.findIndex((e) => e.multipv === l.multipv);
            if (existing >= 0) allLines[existing] = l;
            else allLines.push(l);
          }
        } else if (msg.type === 'bestmove') {
          if (resolved) return;
          resolved = true;
          off();
          const pv1 =
            allLines.find((l) => l.multipv === 1) ?? allLines[0] ?? null;
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
        this.sendRaw(`setoption name MultiPV value ${multiPv}`);
      }
      this.sendRaw(`go movetime ${movetime}`);
      // Safety timeout: if bestmove never comes (e.g. bridge
      // offline), resolve with a best-effort fallback.
      window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        off();
        const pv1 =
          allLines.find((l) => l.multipv === 1) ?? allLines[0] ?? null;
        resolve({
          bestMove: pv1?.pv?.[0] ?? '',
          scoreCp: pv1?.scoreCp ?? null,
          scoreMate: pv1?.scoreMate ?? null,
          lines: multiPv > 1 ? allLines : undefined,
        });
      }, movetime + 1500);
    });
  }

  destroy() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.ready = false;
    this.listeners = [];
  }

  private sendRaw(cmd: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.commandQueue.push(cmd);
      return;
    }
    try {
      this.ws.send(cmd + '\n');
    } catch (err) {
      this.commandQueue.push(cmd);
    }
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
