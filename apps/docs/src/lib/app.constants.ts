export const isServer = typeof window === "undefined";

export const isClient = !isServer;

export const isNodeEnvProd = process.env.NODE_ENV === "production";

export const isNodeEnvDev = process.env.NODE_ENV === "development";

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
