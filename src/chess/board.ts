import type { Square } from './types';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export function isLightSquare(sq: Square): boolean {
  const file = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rank = parseInt(sq[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

export function isValidSquare(sq: string): boolean {
  if (sq.length !== 2) return false;
  const f = sq[0];
  const r = sq[1];
  return FILES.includes(f as (typeof FILES)[number]) && RANKS.includes(r as (typeof RANKS)[number]);
}
