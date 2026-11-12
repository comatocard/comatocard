import { CacheProvider, type EmotionCache } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppProps } from "next/app";
import React from "react";
import { Provider } from "react-redux";

import { HeadProgressBar, Layout } from "~/components/shared";
import { store } from "~/lib/app.store";
import { createEmotionCache } from "~/lib/helpers/createEmotionCache";
import { useHydrateTheme } from "~/lib/theme/useHydrateTheme";
import { GlobalStyles } from "~/styles/GlobalStyles";

const clientSideEmotionCache = createEmotionCache();

const textTargetTags = ["INPUT", "TEXTAREA"];

export const getIsTextTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && textTargetTags.includes(target.nodeName);

const App = ({ Component, pageProps, ...rest }: AppProps & { emotionCache: EmotionCache }) => {
  const { emotionCache = clientSideEmotionCache, router } = rest;

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isTextTarget = getIsTextTarget(e.target);
      const key = e.key.toLowerCase();

      switch (key) {
        case "b": {
          if (e.shiftKey && !isTextTarget) {
            e.preventDefault();
            router.push("/build/overview");
          }
          break;
        }
        case "h": {
          if (e.shiftKey && !isTextTarget) {
            e.preventDefault();
            router.push("/");
          }
          break;
        }
        case "n": {
          if (e.shiftKey && !isTextTarget) {
            e.preventDefault();
            router.push("/contracts/overview");
          }
          break;
        }
        case "u": {
          if (e.shiftKey && !isTextTarget) {
            e.preventDefault();
            router.push("/agents/overview");
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [router]);

  const { theme } = useHydrateTheme();

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <GlobalStyles />
        <HeadProgressBar />

        <Layout>
          <Component {...pageProps} />
        </Layout>
      </ThemeProvider>
    </CacheProvider>
  );
};

const AppWithStore = (props: AppProps & { emotionCache: EmotionCache }) => (
  <Provider store={store}>
    <App {...props} />
  </Provider>
);

export default AppWithStore;
