import type { StreamEvent } from "../bus.js";

export interface StreamFilter {
  vault?: string | undefined;
  merchant?: string | undefined;
}

/** Whether a subscriber with `filter` receives `event`. An empty filter receives nothing. */
export function matchesFilter(event: StreamEvent, filter: StreamFilter): boolean {
  if (filter.vault !== undefined) return event.contract_id === filter.vault;
  if (filter.merchant !== undefined) {
    const data = event.data as { merchant?: unknown };
    return data.merchant === filter.merchant;
  }
  return false;
}
