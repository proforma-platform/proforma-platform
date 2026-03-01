import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        emerald: {
          400: "#34d399",
          500: "#10b981",
          600: "#059669"
        }
      }
    }
  },
  plugins: []
};

export default config;
