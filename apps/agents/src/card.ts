import type { Card, VaultClient, VaultConfig } from "@comatocard/sdk";

export interface CardStatus {
  vault: VaultConfig;
  card: Card | null;
}

/** Reads the vault config and the card bound to `publicKey`; `card` is null for an unknown key. */
export async function readCardStatus(client: VaultClient, publicKey: string): Promise<CardStatus> {
  const [vault, card] = await Promise.all([client.getConfig(), client.getCardByKey(publicKey)]);
  return { vault, card };
}
