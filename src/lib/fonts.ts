import { Amiri, Bodoni_Moda, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Public_Sans } from "next/font/google";

// Prototype faces, self-hosted by next/font at build time (no runtime requests to Google).
export const displayFace = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display-face",
  display: "swap",
});

export const bodyFace = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body-face",
  display: "swap",
});

export const monoFace = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-face",
  display: "swap",
});

// Arabic counterparts: Amiri (naskh, pairs with the Bodoni display face) and IBM Plex Sans Arabic for body text.
export const displayArabic = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-display-arabic",
  display: "swap",
});

export const bodyArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-body-arabic",
  display: "swap",
});

export const fontVariables = [displayFace, bodyFace, monoFace, displayArabic, bodyArabic]
  .map((f) => f.variable)
  .join(" ");
