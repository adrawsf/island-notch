/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      colors: {
        notch: {
          bg: "#000000",
          surface: "#141418",
          elevated: "#1f1f25",
          border: "rgba(255,255,255,0.08)",
          muted: "rgba(235,235,245,0.6)",
          accent: "#0a84ff",
        },
      },
    },
  },
  plugins: [],
};
