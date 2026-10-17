import type { View } from "@/lib/timeline/geometry";

/**
 * Lets other pages ask the timeline to move ("Show on timeline").
 * The timeline page stays mounted across navigations, so a request made just
 * before navigating back to it is picked up by the live timeline. A hash
 * (#year=1914&span=30) carries the same request on a fresh page load.
 */

export type JumpRequest = View & { instant?: boolean };
type Listener = (request: JumpRequest) => void;
let pending: JumpRequest | null = null;
const listeners = new Set<Listener>();

export function requestTimelineJump(view: JumpRequest): void {
  if (listeners.size) listeners.forEach((l) => l(view));
  else pending = view;
}

export function subscribeTimelineJump(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const v = pending;
    pending = null;
    listener(v);
  }
  return () => listeners.delete(listener);
}

export function timelineHash(view: View): string {
  return `#year=${Math.round(view.center)}&span=${Math.round(view.span)}`;
}

export function parseTimelineHash(hash: string): View | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const year = Number(params.get("year"));
  const span = Number(params.get("span") ?? 40);
  if (!params.has("year") || !Number.isFinite(year) || !Number.isFinite(span) || span <= 0) return null;
  return { center: year, span };
}
