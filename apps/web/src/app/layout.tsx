import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "../providers/AppProviders";
import { switzer } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comatocard",
  description: "Programmable payment cards for people and AI agents, enforced on NEAR.",
  icons: { icon: [{ url: "/comatocard-icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
