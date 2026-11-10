/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      colors: {
        // Values come from the theme variables in src/styles/index.css.
        notch: {
          bg: "rgb(var(--notch-bg) / <alpha-value>)",
          fg: "rgb(var(--notch-fg) / <alpha-value>)",
          muted: "rgb(var(--notch-fg) / 0.72)",
          border: "rgb(var(--notch-fg) / 0.08)",
          accent: "#0a84ff",
        },
      },
    },
  },
  plugins: [],
};
