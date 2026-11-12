import { createTheme } from "@mui/material/styles";

import shared from "~/styles/tailwind.theme.json";

const px = (value: string) => Number.parseInt(value, 10);
const breakpoints = {
  values: {
    xs: 0,
    sm: px(shared.screens.sm),
    md: px(shared.screens.md),
    lg: px(shared.screens.lg),
    xl: 1512,
  },
};
const typography = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

export const lightMode = createTheme({
  breakpoints,
  typography,
  palette: { mode: "light", primary: { main: "#0E7C66" }, divider: "#E5E8EC" },
});

export const darkMode = createTheme({
  breakpoints,
  typography,
  palette: { mode: "dark", primary: { main: "#C8FF8C" }, divider: "#2D3237" },
});
