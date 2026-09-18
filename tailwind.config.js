/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      // Theme-aware "white": every white/* utility (text, bg, border)
      // follows --tw-white, which flips to charcoal in Light Mode.
      // Blue/emerald/red accents stay identical in both themes.
      colors: {
        white: 'rgb(var(--tw-white) / <alpha-value>)',
      },      opacity: {
        2: "0.02",
        3: "0.03",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};
