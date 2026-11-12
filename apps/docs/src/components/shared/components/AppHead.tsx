import { defaultTitle } from "~/config/next-seo.config";
import { basePath } from "~/lib/app.constants";
import { darkMode } from "~/lib/theme/mui";

export const AppHead: React.FC = () => (
  <>
    <meta charSet="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href={`${basePath}/favicon/favicon.svg`} />
    <meta name="apple-mobile-web-app-title" content={defaultTitle} />
    <meta name="application-name" content={defaultTitle} />
    <meta name="theme-color" content={darkMode.palette.primary.main} />
  </>
);
