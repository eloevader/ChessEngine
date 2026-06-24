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

export async function fetchLichessEval(fen: string, multiPv = 1): Promise<LichessEvalEntry | null> {
  const url = `${API}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as LichessEvalEntry;
  } catch {
    return null;
  }
}
