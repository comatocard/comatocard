// Design tokens shared with the MUI theme (src/lib/theme/mui.ts); loaded by globals.css @config.
const shared = require("./src/styles/tailwind.theme.json");

const sans = ["Inter", "ui-sans-serif", "system-ui", "sans-serif"];

/** @type {import('tailwindcss').Config} */
module.exports = {
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
        primary: sans,
        inter: sans,
        mono: ["Roboto Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
};
