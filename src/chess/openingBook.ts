// Local opening book loader. We ship a single JSON file
// (`/openings/book.json`) generated at build time from the
// Lichess-org/chess-openings repo (a.tsv–e.tsv). The book is keyed
// by position-only FEN and values are opening names. This is fully
// offline — no network requests.

let cache: Map<string, string> | null = null;
let pending: Promise<Map<string, string>> | null = null;

/** Load the opening book. Called lazily; the result is cached. */
export async function loadBook(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}openings/book.json`);
      if (!res.ok) return new Map();
      const data = (await res.json()) as Record<string, string>;
      cache = new Map(Object.entries(data));
      return cache;
    } catch {
      return new Map();
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Look up an opening name for a FEN. Returns the cached value
 *  if the book is loaded, otherwise null (the book hasn't been
 *  fetched yet). */
export function lookupBook(book: Map<string, string> | null, fen: string): string | null {
  if (!book) return null;
  return book.get(stripFen(fen)) ?? null;
}

/** Strip the move counters and fullmove from a FEN, leaving just
 *  the position (pieces, side, castling, en passant, halfmove).
 *  This makes the book tolerant of small format differences. */
export function stripFen(fen: string): string {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}
