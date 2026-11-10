import { EventEmitter } from "node:events";
import type { ComatocardEvent } from "@comatocard/sdk";

/** An event as pushed to WebSocket subscribers after its block is committed. */
export interface StreamEvent {
  contract_id: string;
  event: ComatocardEvent["event"];
  data: ComatocardEvent["data"];
  block_height: number;
  tx_hash: string | null;
  timestamp: string;
}

/** In-process fan-out from the ingestion loop to WebSocket connections. */
export class EventBus {
  readonly #emitter = new EventEmitter().setMaxListeners(0);

  publish(event: StreamEvent): void {
    this.#emitter.emit("event", event);
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.#emitter.on("event", listener);
    return () => this.#emitter.off("event", listener);
  }
}
