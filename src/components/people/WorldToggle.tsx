"use client";

import { useState, type ReactNode } from "react";

/** Hides the "in the world" rows of a life list until asked, so the person's own life reads first. */
export function WorldToggle({ show, hide, children }: { show: string; hide: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group grid gap-2" data-world={open ? "shown" : "hidden"}>
      {children}
      <button
        type="button"
        className="chip justify-self-start"
        aria-pressed={open}
        data-testid="world-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? hide : show}
      </button>
    </div>
  );
}
