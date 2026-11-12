import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Layout } from "~/components/shared";
import { basePath, siteName, siteUrl } from "~/lib/app.constants";
import { home } from "~/lib/site";

import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${home.title} – ${siteName}`, template: `%s – ${siteName}` },
  description: home.description,
  applicationName: siteName,
  appleWebApp: { title: siteName },
  icons: { icon: { url: `${basePath}/favicon/favicon.svg`, type: "image/svg+xml" } },
  openGraph: { siteName, type: "website", locale: "en" },
  twitter: { card: "summary" },
};

export const viewport: Viewport = { themeColor: "#C8FF8C" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="no-scrollbar">
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
