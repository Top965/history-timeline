export type ThemeChoice = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before first paint: applies a saved light/dark choice so there is no
 * flash. With no saved choice, CSS follows prefers-color-scheme.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readThemeChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const THEME_EVENT = "history-timeline:theme";

/** Notifies on changes from this tab (custom event) and other tabs (storage event). */
export function subscribeThemeChoice(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this page.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
