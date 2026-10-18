import { expect, it } from "vitest";
import { cameFrom, recordVisit } from "@/components/ui/navTrail";

it("follows the trail forward and back without bouncing between two pages", () => {
  // A page asks where it came from while mounting, then the trail records it.
  const visit = (path: string) => {
    const from = cameFrom(path);
    recordVisit(path);
    return from;
  };
  expect(visit("/en")).toBeNull();
  expect(visit("/en/topics/egypt")).toBe("/en");
  expect(visit("/en/events/pyramid")).toBe("/en/topics/egypt");
  expect(visit("/en/events/pyramid")).toBe("/en/topics/egypt");
  // Back to the topic: its Back now leads home, not to the event again.
  expect(visit("/en/topics/egypt")).toBe("/en");
  expect(visit("/en/people/khufu")).toBe("/en/topics/egypt");
});
