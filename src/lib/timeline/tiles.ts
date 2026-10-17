import { MIN_YEAR, type View } from "./geometry";

/**
 * Smaller events load in "tiles": fixed stretches of time per zoom level, so the
 * same tile is cached and shared by every visitor who zooms there. Each tile holds
 * at most TILE_LIMIT events, the best known first, so a crowded century costs the
 * same as a quiet one; zooming in brings finer tiles with more of them.
 * Importance 1 always ships with the page. Level 2 holds importance 2 only (it
 * shows from 4,000 years, before importance 3 does, see `showsAtZoom`).
 */
export type TileLevel = 2 | 3 | 4 | 5;

export const TILE_LEVELS = [2, 3, 4, 5] as const;

export const TILE_YEARS: Record<TileLevel, number> = { 2: 1000, 3: 100, 4: 10, 5: 1 };

/** Below this many years on screen, a level's tiles load and show. */
export const LEVEL_SPAN: Record<TileLevel, number> = { 2: 4000, 3: 700, 4: 70, 5: 8 };

/** Most events one tile holds. */
export const TILE_LIMIT = 40;

export const tileKey = (level: TileLevel, tile: number) => `${level}:${tile}`;

/** First and last year a tile covers. */
export function tileRange(level: TileLevel, tile: number): { from: number; to: number } {
  const size = TILE_YEARS[level];
  return { from: tile * size, to: tile * size + size - 1 };
}

export function isValidTile(level: number, tile: number, currentYear: number): level is TileLevel {
  if (!(TILE_LEVELS as readonly number[]).includes(level)) return false;
  if (!Number.isInteger(tile)) return false;
  const { from, to } = tileRange(level as TileLevel, tile);
  return to >= MIN_YEAR && from <= currentYear + 10;
}

/** Levels whose tiles show at this zoom. */
export const activeLevels = (span: number): TileLevel[] => TILE_LEVELS.filter((l) => span < LEVEL_SPAN[l]);

/** The tiles needed to fill a view, plus one on each side so panning finds them ready. */
export function tilesForView(view: View, currentYear: number): { level: TileLevel; tile: number }[] {
  const out: { level: TileLevel; tile: number }[] = [];
  for (const level of activeLevels(view.span)) {
    const size = TILE_YEARS[level];
    const lo = Math.floor((view.center - view.span / 2) / size) - 1;
    const hi = Math.floor((view.center + view.span / 2) / size) + 1;
    for (let tile = lo; tile <= hi; tile++) {
      if (isValidTile(level, tile, currentYear)) out.push({ level, tile });
    }
  }
  return out;
}
