// Lichess game API. The browser talks directly to lichess.org's
// public REST API to fetch a user's recent games.
//
// Endpoint used:
//   GET https://lichess.org/api/games/user/{username}?max=30&pgn=true&clocks=false&evals=false
//     Returns a text/plain PGN blob with up to 30 of the user's
//     most recent games, separated by blank lines. Each game starts
//     with `[Event "..."]`. We split the blob on that and parse
//     each game with our PGN parser.
//
// The response Content-Type is `application/x-chess-pgn` (text
// PGN), NOT NDJSON. We previously requested `Accept:
// application/x-ndjson` which is a CORS preflight trigger; the
// text PGN response is simpler and avoids the preflight entirely.
//
// The PGN is parsed with a small custom parser that extracts just
// the moves and a few headers (White, Black, Result, Date, Event,
// Site, ECO, Opening). We don't need a full PGN parser for this.

export interface LichessGameSummary {
  id: string;
  pgn: string;
  white: string;
  black: string;
  result: string; // "1-0", "0-1", "1/2-1/2", "*"
  date: string;
  speed: string;
  rated: boolean;
  opening: string;
  url: string;
}

/** Fetch the most recent N games for the given Lichess username.
 *  Returns summaries with PGN strings. */
export async function fetchLichessGames(
  username: string,
  max: number = 20,
): Promise<LichessGameSummary[]> {
  const cleanUser = username.trim();
  if (!cleanUser) return [];
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(
    cleanUser,
  )}?max=${max}&pgn=true&clocks=false&evals=false&opening=true`;
  // No special Accept header — Lichess's default response is
  // `application/x-chess-pgn` (plain text PGN), which avoids the
  // CORS preflight that `application/x-ndjson` would trigger.
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Lichess user "${cleanUser}" not found.`);
    }
    throw new Error(`Lichess API returned ${res.status}.`);
  }
  const text = await res.text();
  // The PGN blob contains multiple games separated by blank lines.
  // Each game begins with `[Event "..."]`. Split on the start of a
  // new Event header and parse each chunk.
  const chunks = text
    .split(/\n\[Event\s+"/)
    .map((c, i) => (i === 0 ? c : '[Event "' + c))
    .filter((c) => c.trim().length > 0);
  const out: LichessGameSummary[] = [];
  for (const chunk of chunks) {
    try {
      const parsed = parsePgn(chunk);
      const id = parsed.headers.Site?.match(/lichess\.org\/(\w+)/)?.[1] ?? '';
      out.push({
        id,
        pgn: chunk,
        white: parsed.headers.White ?? '?',
        black: parsed.headers.Black ?? '?',
        result: parsed.headers.Result ?? '*',
        date: parsed.headers.Date ?? '',
        speed: parsed.headers.Event?.replace(/^rated\s+/i, '') ?? '',
        rated: /^rated/i.test(parsed.headers.Event ?? ''),
        opening: parsed.headers.Opening ?? '',
        url: id ? `https://lichess.org/${id}` : '',
      });
    } catch {
      // skip malformed chunks
    }
  }
  return out;
}

/** Parse a PGN string and return the headers + a list of SAN moves
 *  in the main line. We do NOT support variations — only the
 *  primary game line. */
export function parsePgn(pgn: string): {
  headers: Record<string, string>;
  moves: string[];
} {
  const headers: Record<string, string> = {};
  // Extract headers (lines starting with [Name "value"])
  const headerRe = /^\[(\w+)\s+"([^"]*)"\]\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(pgn)) !== null) {
    headers[m[1]] = m[2];
  }
  // Strip headers from the body
  let body = pgn.replace(headerRe, '').trim();
  // Remove comments in { } and ( )
  body = body.replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '');
  // Remove line numbers (e.g. "1. e4 e5 2. Nf3 Nc6")
  // Tokens are: number-dot, SAN, SAN, number-dot, SAN, ...
  // Split by whitespace and take tokens that look like moves.
  const tokens = body.split(/\s+/).filter(Boolean);
  const moves: string[] = [];
  for (const tok of tokens) {
    if (/^\d+\.+$/.test(tok)) continue; // move number, e.g. "1."
    if (/^\d+\.\.\.$/.test(tok)) continue; // black's move number
    if (tok === '1-0' || tok === '0-1' || tok === '1/2-1/2' || tok === '*') {
      break; // result tag at the end
    }
    // SAN moves end with optional + # ? !
    moves.push(tok);
  }
  return { headers, moves };
}
