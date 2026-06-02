import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#17201c",
        graphite: "#2f3935",
        field: "#f3f5f2",
        panel: "#ffffff",
        muted: "#edf0ec",
        line: "#d7ddd8",
        moss: "#2f6f52",
        steel: "#3f5c70",
        saffron: "#b7791f",
        berry: "#9f315c"
      }
    }
  },
  plugins: []
} satisfies Config;
