"use client";

import { type StreamEvent, streamEvent } from "@comatocard/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { INDEXER_WS_URL } from "../lib/config";
import { keys } from "./data";

export type FeedState = "connecting" | "live" | "offline";

/**
 * Subscribes to the indexer's stream for one vault. Each committed event refreshes the queries it
 * can change; the socket reconnects with a growing delay when it drops.
 */
export function useLiveFeed(vault: string | null, onEvent?: (event: StreamEvent) => void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FeedState>("connecting");

  useEffect(() => {
    if (!vault) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let closed = false;

    const open = () => {
      setState("connecting");
      socket = new WebSocket(`${INDEXER_WS_URL}/stream?vault=${encodeURIComponent(vault)}`);
      socket.onopen = () => {
        retry = 0;
        setState("live");
      };
      socket.onmessage = (message) => {
        const parsed = streamEvent.safeParse(JSON.parse(String(message.data)));
        if (!parsed.success) return;
        void queryClient.invalidateQueries({ queryKey: keys.vault(vault) });
        onEvent?.(parsed.data);
      };
      socket.onclose = () => {
        if (closed) return;
        setState("offline");
        retry += 1;
        timer = window.setTimeout(open, Math.min(30_000, 1_000 * 2 ** retry));
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [vault, queryClient, onEvent]);

  return state;
}
