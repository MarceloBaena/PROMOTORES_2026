import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Manrope", "Segoe UI Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "Segoe UI Variable", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#0F172A",
        graphite: "#334155",
        field: "#F8FAFC",
        panel: "#FFFFFF",
        muted: "#E2E8F0",
        line: "#E2E8F0",
        brand: "#2563EB",
        brandSoft: "#DBEAFE",
        execution: "#10B981",
        executionSoft: "#D1FAE5",
        navy: "#0F172A",
        slateText: "#64748B",
        slateSoft: "#94A3B8",
        warning: "#F59E0B",
        danger: "#EF4444",
        moss: "#10B981",
        forest: "#0F172A",
        steel: "#2563EB",
        skywash: "#EFF6FF",
        saffron: "#F59E0B",
        berry: "#EF4444",
        copper: "#F59E0B"
      }
    }
  },
  plugins: []
} satisfies Config;
