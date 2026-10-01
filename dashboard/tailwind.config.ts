import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0f172a",
          muted: "#475569",
        },
        brand: {
          DEFAULT: "#1d4ed8",
          soft: "#eff6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
