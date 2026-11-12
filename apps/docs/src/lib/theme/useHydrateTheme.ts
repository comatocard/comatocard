import { useTheme } from "nextra-theme-docs";

import { darkMode, lightMode } from "~/lib/theme/mui";

/** MUI theme that follows the Nextra (next-themes) colour mode, dark until it resolves. */
export const useHydrateTheme = () => {
  const { resolvedTheme } = useTheme();
  return { theme: resolvedTheme === "light" ? lightMode : darkMode };
};
