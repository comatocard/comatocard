"use client";

import { usePathname } from "next/navigation";

import { normalizeRoute } from "~/lib/site";

/** The current route without a trailing slash, for example `/build/integration`. */
export const useNormalizedRoute = () => normalizeRoute(usePathname() ?? "/");

export const useIsHomePage = () => useNormalizedRoute() === "/";
