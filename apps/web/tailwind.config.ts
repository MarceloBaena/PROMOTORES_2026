import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Aptos", "Bahnschrift", "Segoe UI Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Bahnschrift", "Aptos Display", "Aptos", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#111917",
        graphite: "#2c3633",
        field: "#eef2ee",
        panel: "#ffffff",
        muted: "#e8eee9",
        line: "#d6ded8",
        moss: "#256f4b",
        forest: "#103f32",
        steel: "#365f78",
        skywash: "#e7f1f4",
        saffron: "#b7791f",
        berry: "#9f315c",
        copper: "#a7662b"
      }
    }
  },
  plugins: []
} satisfies Config;
