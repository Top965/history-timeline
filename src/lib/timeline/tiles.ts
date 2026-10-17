import { MIN_YEAR, type View } from "./geometry";

/**
 * Smaller events load in "tiles": fixed stretches of time per importance level,
 * so the same tile is cached and shared by every visitor who zooms there.
 * Importance 1 always ships with the page. The spans match `showsAtZoom`.
 */
export type TileLevel = 2 | 3;

export const TILE_YEARS: Record<TileLevel, number> = { 2: 1000, 3: 100 };

/** Below this many years on screen, events of that importance show. */
export const LEVEL_SPAN: Record<TileLevel, number> = { 2: 4000, 3: 700 };

export const tileKey = (level: TileLevel, tile: number) => `${level}:${tile}`;

/** First and last year a tile covers. */
export function tileRange(level: TileLevel, tile: number): { from: number; to: number } {
  const size = TILE_YEARS[level];
  return { from: tile * size, to: tile * size + size - 1 };
}

export function isValidTile(level: number, tile: number, currentYear: number): level is TileLevel {
  if (level !== 2 && level !== 3) return false;
  if (!Number.isInteger(tile)) return false;
  const { from, to } = tileRange(level, tile);
  return to >= MIN_YEAR && from <= currentYear + 10;
}

/** The tiles needed to fill a view, plus one on each side so panning finds them ready. */
export function tilesForView(view: View, currentYear: number): { level: TileLevel; tile: number }[] {
  const out: { level: TileLevel; tile: number }[] = [];
  for (const level of [2, 3] as const) {
    if (view.span >= LEVEL_SPAN[level]) continue;
    const size = TILE_YEARS[level];
    const lo = Math.floor((view.center - view.span / 2) / size) - 1;
    const hi = Math.floor((view.center + view.span / 2) / size) + 1;
    for (let tile = lo; tile <= hi; tile++) {
      if (isValidTile(level, tile, currentYear)) out.push({ level, tile });
    }
  }
  return out;
}
