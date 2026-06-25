export interface LichessEvalEntry {
  fen: string;
  knodes: number;
  depth: number;
  pvs: Array<{
    moves: string;
    cp: number | null;
    mate: number | null;
  }>;
}

const API = 'https://lichess.org/api/cloud-eval';
const FETCH_TIMEOUT_MS = 2500;

export async function fetchLichessEval(fen: string, multiPv = 1): Promise<LichessEvalEntry | null> {
  const url = `${API}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      // 404 just means Lichess doesn't have this position in its cloud
      // database. Not an error worth logging — Stockfish will still evaluate.
      if (res.status !== 404) {
        console.warn(`Lichess cloud eval returned ${res.status}`);
      }
      return null;
    }
    return (await res.json()) as LichessEvalEntry;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
