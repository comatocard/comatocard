"use client";

import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";

import { darkMode, lightMode } from "~/lib/theme/mui";

/** MUI follows the colour mode next-themes resolved, dark until it resolves. */
const MuiTheme = ({ children }: { children: ReactNode }) => {
  const { resolvedTheme } = useTheme();
  return (
    <MuiThemeProvider theme={resolvedTheme === "light" ? lightMode : darkMode}>
      {children}
    </MuiThemeProvider>
  );
};

export const Providers = ({ children }: { children: ReactNode }) => (
  // MUI styles go into the `mui` layer, below Tailwind utilities (see globals.css), so utility
  // classes on MUI components win as they did with Tailwind 3.
  <AppRouterCacheProvider options={{ enableCssLayer: true }}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MuiTheme>{children}</MuiTheme>
    </ThemeProvider>
  </AppRouterCacheProvider>
);
