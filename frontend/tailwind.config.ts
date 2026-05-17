import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#122033",
        mist: "#eef4f7",
        line: "#d5dee7",
        accent: "#1f6f78"
      }
    }
  },
  plugins: []
};

export default config;
