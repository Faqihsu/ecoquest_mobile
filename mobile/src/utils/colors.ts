// EcoQuest Color Palette - Sustainability Theme
// Colors represent: Nature, Growth, Energy, Trust

export const Colors = {
  // Primary Backgrounds
  background: {
    dark: "#0a0e1a",      // Deep forest navy
    darker: "#050608",     // Almost black
    card: "#0f1419",       // Card background
  },

  // Accent Colors
  accent: {
    primary: "#10d981",    // Fresh green (nature, growth)
    primaryLight: "#34d399", // Lighter green
    primaryDark: "#059669",  // Darker green
  },

  // Secondary Colors
  secondary: {
    teal: "#14b8a6",       // Teal/cyan (water, earth)
    blue: "#3b82f6",       // Trust, sky
    orange: "#f59e0b",     // Sun, energy, warmth
    amber: "#fbbf24",      // Gold
  },

  // Status Colors
  status: {
    success: "#10d981",    // Green
    warning: "#f59e0b",    // Orange
    error: "#ef4444",      // Red
    info: "#3b82f6",       // Blue
  },

  // Text Colors
  text: {
    primary: "#f5f5f5",    // Main text
    secondary: "#a0aec0",  // Secondary text
    muted: "#64748b",      // Muted text
    inverse: "#0a0e1a",    // For light backgrounds
  },

  // Border Colors
  border: {
    light: "rgba(255, 255, 255, 0.1)",
    medium: "rgba(255, 255, 255, 0.15)",
    dark: "rgba(255, 255, 255, 0.05)",
  },

  // Overlay/Transparency
  overlay: {
    greenLight: "rgba(16, 217, 129, 0.1)",
    greenMedium: "rgba(16, 217, 129, 0.15)",
    tealLight: "rgba(20, 184, 166, 0.1)",
    orangeLight: "rgba(245, 158, 11, 0.1)",
    blueLight: "rgba(59, 130, 246, 0.1)",
  },
};

// Utility functions
export const getGradient = (type: "primary" | "secondary" | "tertiary") => {
  switch (type) {
    case "primary":
      return [Colors.background.dark, Colors.background.darker];
    case "secondary":
      return [Colors.background.card, Colors.background.dark];
    case "tertiary":
      return ["rgba(16, 217, 129, 0.05)", Colors.background.dark];
    default:
      return [Colors.background.dark, Colors.background.darker];
  }
};

export const getAccentColor = (intensity: "light" | "medium" | "dark" = "medium") => {
  switch (intensity) {
    case "light":
      return Colors.accent.primaryLight;
    case "dark":
      return Colors.accent.primaryDark;
    default:
      return Colors.accent.primary;
  }
};
