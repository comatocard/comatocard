import { describe, expect, it } from "vitest";
import { routeHost } from "../src/lib/hosts";

const ORIGINS = { site: "https://comatocard.xyz", app: "https://app.comatocard.xyz" };

describe("routeHost", () => {
  it("opens the app at the root of the app host", () => {
    expect(routeHost("app.comatocard.xyz", "/", "", ORIGINS)).toEqual({
      kind: "rewrite",
      pathname: "/connect",
    });
  });

  it("serves app routes on the app host as they are", () => {
    for (const path of ["/connect", "/home", "/cards/3", "/setup", "/approvals"]) {
      expect(routeHost("app.comatocard.xyz", path, "", ORIGINS)).toEqual({ kind: "next" });
    }
  });

  it("sends site pages on the app host back to the site, keeping the query", () => {
    expect(routeHost("app.comatocard.xyz", "/shop", "?item=1", ORIGINS)).toEqual({
      kind: "redirect",
      url: "https://comatocard.xyz/shop?item=1",
    });
  });

  it("moves an app route on the site host to the app host, keeping the query", () => {
    expect(routeHost("comatocard.xyz", "/cards/2", "?vault=v.testnet", ORIGINS)).toEqual({
      kind: "redirect",
      url: "https://app.comatocard.xyz/cards/2?vault=v.testnet",
    });
  });

  it("leaves the landing page and the shop on the site host", () => {
    expect(routeHost("comatocard.xyz", "/", "", ORIGINS)).toEqual({ kind: "next" });
    expect(routeHost("comatocard.xyz", "/shop", "", ORIGINS)).toEqual({ kind: "next" });
  });

  it("does not mistake a path that only starts like an app route", () => {
    expect(routeHost("comatocard.xyz", "/homepage", "", ORIGINS)).toEqual({ kind: "next" });
  });

  it("changes nothing on other hosts or without both origins", () => {
    expect(routeHost("comatocard.vercel.app", "/home", "", ORIGINS)).toEqual({ kind: "next" });
    expect(routeHost("localhost:3000", "/", "", ORIGINS)).toEqual({ kind: "next" });
    expect(
      routeHost("comatocard.xyz", "/home", "", { site: ORIGINS.site, app: undefined }),
    ).toEqual({
      kind: "next",
    });
    expect(routeHost(null, "/home", "", ORIGINS)).toEqual({ kind: "next" });
  });
});
