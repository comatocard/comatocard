import { DEFAULT_FORM, type PolicyForm } from "./policy-form";

/** The three setup steps, then the screen that hands over the card key. */
export const SETUP_STEPS = ["Card account", "Funds", "First card"] as const;
export const DONE_STEP = SETUP_STEPS.length;

/** Amounts offered as one tap on the funds step, in token units. */
export const QUICK_AMOUNTS = ["50", "100", "500"] as const;

/**
 * Where a returning owner resumes: the first step the chain says is not done. All done means there
 * is nothing to set up, and no key to show again, so the caller sends them home.
 */
export function resumeStep(done: readonly boolean[]): number | "complete" {
  const open = done.findIndex((d) => !d);
  return open === -1 ? "complete" : open;
}

/** The limits the first-card step asks for; everything else keeps the policy defaults. */
export interface FirstCardLimits {
  perTx: string;
  daily: string;
  monthly: string;
  /** Empty when every payment inside the limits settles without asking. */
  askAbove: string;
}

export const FIRST_CARD_LIMITS: FirstCardLimits = {
  perTx: DEFAULT_FORM.perTx,
  daily: DEFAULT_FORM.daily,
  monthly: DEFAULT_FORM.monthly,
  askAbove: DEFAULT_FORM.threshold,
};

/** The full policy form for the first card: any merchant, blocked counterparties refused. */
export function firstCardForm(limits: FirstCardLimits): PolicyForm {
  return {
    ...DEFAULT_FORM,
    perTx: limits.perTx,
    daily: limits.daily,
    monthly: limits.monthly,
    threshold: limits.askAbove,
  };
}

/** The `.env` lines an agent needs to pay with the card. */
export const cardEnv = (vault: string, secret: string) =>
  `VAULT_ID=${vault}\nCARD_PRIVATE_KEY=${secret}\n`;
