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
        field: "#f5f7f6",
        line: "#d9dfda",
        moss: "#2f6f52",
        saffron: "#b7791f",
        berry: "#9f315c"
      }
    }
  },
  plugins: []
} satisfies Config;
