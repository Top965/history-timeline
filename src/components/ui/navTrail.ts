"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Pages visited in this tab, oldest first; going back to the one before the last pops the last. */
const trail: string[] = [];
const at = (i: number): string | null => trail[trail.length - i] ?? null;

/**
 * The page that led to `path`, whether or not the trail has recorded `path`
 * yet (a page reads this while it mounts, before the trail's effect runs).
 */
export function cameFrom(path: string): string | null {
  if (at(1) === path) return at(2);
  if (at(2) === path) return at(3);
  return at(1);
}

export function recordVisit(path: string) {
  if (at(1) === path) return;
  if (at(2) === path) trail.pop();
  else trail.push(path);
  if (trail.length > 50) trail.shift();
}

/** Records each page so a content page can offer Back to the page that led to it. */
export function NavTrail() {
  const pathname = usePathname();
  useEffect(() => recordVisit(pathname), [pathname]);
  return null;
}
