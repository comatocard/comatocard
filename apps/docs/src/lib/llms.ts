import { basePath, siteUrl } from "~/lib/app.constants";

/** Absolute site origin for llms.txt links, without a trailing slash. */
export const origin = new URL(basePath, siteUrl).toString().replace(/\/$/, "");
