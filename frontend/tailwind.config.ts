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
        // Design-token colours (Q2: warm-white + calm-blue palette)
        accent: "#2F6FED",       // buttons, today ring, links
        "accent-hover": "#1A56D6",
        surface: "#FFFFFF",      // cards, modals
        border: "#E7E7E2",       // subtle warm-gray borders
        "past-cell": "#E8E8E3",  // year-grid past-date cells
      },
    },
  },
  plugins: [],
};
export default config;
