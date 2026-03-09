/**
 * theme.ts — EcoQuest Design System
 * Single source of truth untuk semua token desain premium
 */

export const Theme = {
  // ── Palette ──────────────────────────────────────────────────────────────
  color: {
    // Backgrounds
    bg: {
      void:    "#030712",   // Absolute black
      deep:    "#060d1a",   // Deep forest navy
      surface: "#0c1628",   // Card surface
      glass:   "rgba(12, 22, 40, 0.72)", // Glassmorphism base
    },

    // Greens (primary brand)
    green: {
      neon:   "#00ff87",   // Neon mint CTA
      bright: "#10d981",   // Fresh green
      mid:    "#059669",   // Mid green
      dark:   "#064e3b",   // Deep forest
      glow:   "rgba(0, 255, 135, 0.18)", // Glow overlay
      glowSm: "rgba(0, 255, 135, 0.08)",
    },

    // Ocean blues
    ocean: {
      bright: "#38bdf8",   // Sky blue
      mid:    "#0ea5e9",   // Ocean
      deep:   "#0369a1",   // Deep sea
      glow:   "rgba(56, 189, 248, 0.12)",
    },

    // Accents
    amber:  "#fbbf24",
    coral:  "#f87171",
    purple: "#a78bfa",

    // Text
    text: {
      primary:   "#f0fdf4",  // Near white with green tint
      secondary: "#94a3b8",
      muted:     "#475569",
      inverse:   "#030712",
    },

    // Borders
    border: {
      subtle:  "rgba(255,255,255,0.06)",
      light:   "rgba(255,255,255,0.10)",
      green:   "rgba(0, 255, 135, 0.20)",
      ocean:   "rgba(56, 189, 248, 0.20)",
    },
  },

  // ── Spacing ───────────────────────────────────────────────────────────────
  space: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },

  // ── Radius ────────────────────────────────────────────────────────────────
  radius: {
    sm:   8,
    md:   14,
    lg:   20,
    xl:   28,
    full: 999,
  },

  // ── Typography ────────────────────────────────────────────────────────────
  font: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   18,
    xl:   22,
    xxl:  28,
    hero: 36,
  },

  // ── Shadows ───────────────────────────────────────────────────────────────
  shadow: {
    green: {
      shadowColor:   "#00ff87",
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius:  12,
      elevation:     8,
    },
    ocean: {
      shadowColor:   "#38bdf8",
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius:  12,
      elevation:     8,
    },
    card: {
      shadowColor:   "#000",
      shadowOffset:  { width: 0, height: 8 },
      shadowOpacity: 0.40,
      shadowRadius:  20,
      elevation:     10,
    },
  },
} as const;

export type ThemeType = typeof Theme;
