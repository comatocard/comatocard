const twDefaultTheme = require("tailwindcss/defaultTheme");
const shared = require("./src/styles/tailwind.theme.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,js,jsx,md,mdx}"],
  plugins: [require("@tailwindcss/line-clamp")],
  theme: {
    screens: { ...shared.screens, xl: "1512px" },
    colors: {
      current: "currentColor",
      inherit: "inherit",
      transparent: "transparent",
      ...shared.colors,
    },
    fontSize: shared.fontSize,
    extend: {
      screens: shared.extend.screens,
      boxShadow: shared.extend.boxShadow,
      fontFamily: {
        primary: ["Inter", ...twDefaultTheme.fontFamily.sans],
        inter: ["Inter", ...twDefaultTheme.fontFamily.sans],
        roobert: ["Inter", ...twDefaultTheme.fontFamily.sans],
        mono: ["Roboto Mono", ...twDefaultTheme.fontFamily.mono],
      },
    },
  },
};
