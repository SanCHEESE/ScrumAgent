import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Tailwind is utility-only here. The Kabanchik design system uses CSS variables
  // (see styles/tokens.css) for theming, density, and component styles. Don't
  // try to convert design tokens to Tailwind config — port CSS as-is.
  corePlugins: {
    preflight: false,
  },
};

export default config;
