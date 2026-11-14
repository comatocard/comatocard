import { type NextRequest, NextResponse } from "next/server";
import { routeHost } from "./lib/hosts";

/** Puts the owner app on its own host when `NEXT_PUBLIC_SITE_ORIGIN` and `NEXT_PUBLIC_APP_ORIGIN` are set. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const route = routeHost(request.headers.get("host"), pathname, search, {
    site: process.env.NEXT_PUBLIC_SITE_ORIGIN,
    app: process.env.NEXT_PUBLIC_APP_ORIGIN,
  });
  if (route.kind === "redirect") return NextResponse.redirect(route.url, 308);
  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

// Pages only: API routes, Next assets and files with an extension pass straight through.
export const config = { matcher: ["/((?!api/|_next/|.*\\..*).*)"] };
