// Lichess opening explorer. We use the public explorer API:
//   https://lichess.org/api/explorer/lichess?fen=<FEN>&moves=<N>&topGames=0
//
// (Note: the older `explorer.lichess.ovh` mirror was retired in
// 2024; the canonical endpoint is now under lichess.org itself.)
//
// The API is rate-limited to ~20 req/s per IP and returns a list of
// the most popular moves from a given position, each with how many
// games reached that move and the resulting win/draw/loss stats.
// We use it to:
//   1. Look up the opening name (e.g. "Sicilian Defense: Najdorf
//      Variation") for the current position.
//   2. Determine whether a given move is a "book" move (it appears
//      in the explorer's top moves for the position).
//   3. Provide a list of likely book continuations for the user to
//      browse from a position.

const EXPLORER_URL = 'https://lichess.org/api/explorer/lichess';

export interface ExplorerMove {
  /** UCI move id, e.g. "e2e4" */
  uci: string;
  /** SAN move, e.g. "e4" */
  san: string;
  /** Average rating of the games that reached this position. */
  averageRating: number;
  white: number;
  draws: number;
  black: number;
  /** Total games that played this move. */
  games: number;
}

export interface ExplorerResponse {
  /** The opening name (e.g. "Ruy López"). Null for positions
   *  outside any known opening. */
  opening?: { name: string; eco?: string } | null;
  /** All moves played from this position, sorted by frequency. */
  moves: ExplorerMove[];
  /** Total games in the explorer database for this position. */
  white: number;
  draws: number;
  black: number;
  /** Whether the position is in the opening explorer DB. */
  inDatabase: boolean;
}

const cache = new Map<string, ExplorerResponse>();

export async function fetchExplorer(
  fen: string,
  moves: number = 12,
): Promise<ExplorerResponse | null> {
  // Use a cache so navigating around the same position doesn't
  // re-hit the API.
  const key = `${fen}|${moves}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    // `speeds` filters out correspondence games, which the
    // explorer otherwise includes in the totals. The endpoint
    // accepts multiple `speeds[]=...` params.
    const params = new URLSearchParams();
    params.set('fen', fen);
    params.set('moves', String(moves));
    params.set('topGames', '0');
    for (const s of ['bullet', 'blitz', 'rapid', 'classical']) {
      params.append('speeds', s);
    }
    const url = `${EXPLORER_URL}?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as ExplorerResponse;
    cache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/** Given a SAN move and a list of explorer moves, return true if
 *  the move is in the explorer's top-N for the position. We use
 *  this to mark moves as "book". */
export function isInExplorer(
  explorer: ExplorerResponse | null,
  san: string,
): boolean {
  if (!explorer) return false;
  return explorer.moves.some(
    (m) => m.san.replace(/[+#!?]+$/g, '') === san.replace(/[+#!?]+$/g, ''),
  );
}
