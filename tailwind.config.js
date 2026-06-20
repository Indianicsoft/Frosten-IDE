/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        frosten: {
          bg: "#0D1117",
          panel: "rgba(22, 27, 34, 0.7)",
          card: "rgba(30, 41, 59, 0.4)",
          border: "rgba(125, 211, 252, 0.15)",
          borderActive: "rgba(125, 211, 252, 0.4)",
          ice: "#7DD3FC",
          cyan: "#38BDF8",
          white: "#F8FAFC",
          muted: "#94A3B8"
        }
      },
      fontFamily: {
        ui: ["Inter", "system-ui", "sans-serif"],
        editor: ["JetBrains Mono", "monospace"]
      }
    },
  },
  plugins: [],
}
