import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Design-token colours (purple + grey-white palette)
        accent: "#6D4DD6",        // buttons, today ring, links
        "accent-hover": "#5E3FC0",
        "accent-soft": "#EFEAFB", // light lavender tint for banners / soft hovers
        surface: "#FFFFFF",       // cards, modals
        border: "#E6E3F0",        // slightly lavender-grey borders
        "past-cell": "#E8E8E3",   // year-grid past-date cells
      },
    },
  },
  plugins: [],
};
export default config;
