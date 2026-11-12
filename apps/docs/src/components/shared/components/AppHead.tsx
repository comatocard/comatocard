import { defaultTitle } from "~/config/next-seo.config";
import { darkMode } from "~/lib/theme/mui";

import { PreloadedFonts } from "./PreloadedFonts";

export const AppHead: React.FC = () => (
  <>
    <meta charSet="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
    <meta name="apple-mobile-web-app-title" content={defaultTitle} />
    <meta name="application-name" content={defaultTitle} />
    <meta name="theme-color" content={darkMode.palette.primary.main} />

    <PreloadedFonts />
  </>
);
