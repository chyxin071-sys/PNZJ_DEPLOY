/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        gold: {
          300: "#f0d78c",
          400: "#d4a843",
          500: "#c9a96e",
          600: "#b8943a",
          700: "#9a7b2f",
        },
        sidebar: {
          DEFAULT: "#111111",
          hover: "#1c1c1c",
          active: "#222222",
          border: "#2a2a2a",
        },
      },
    },
  },
  plugins: [],
};