import type { CardKind, Policy } from "./types.js";

/** A finding for a person to review before signing; it never blocks a call by itself. */
export interface ComplianceWarning {
  field: string;
  code: "personal_data" | "agent_without_checks";
  message: string;
}

const PATTERNS: [RegExp, string][] = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
  [/(?:\+62|\b0)8\d{7,11}\b/, "an Indonesian phone number"],
  [/\+\d{9,15}\b/, "a phone number"],
  [/\b\d{16}\b/, "a 16 digit number such as an Indonesian national id (NIK)"],
];

/**
 * Card labels, memos and references are public and permanent on-chain, so they must not carry
 * personal data (EDPB Guidelines 02/2025, UU PDP). Returns a warning for each field that looks
 * like it does. Prefer an opaque or hashed reference and keep the invoice off-chain.
 */
export function publicTextWarnings(
  fields: Record<string, string | null | undefined>,
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    const hit = PATTERNS.find(([pattern]) => pattern.test(text));
    if (hit) {
      warnings.push({
        field,
        code: "personal_data",
        message: `${field} looks like it contains ${hit[1]}; on-chain text is public and cannot be erased`,
      });
    }
  }
  return warnings;
}

/** Warnings for a card before `create_card` or `update_policy`. */
export function cardWarnings(input: {
  kind: CardKind;
  policy: Policy;
  label?: string;
}): ComplianceWarning[] {
  const warnings = publicTextWarnings({ label: input.label });
  if (input.kind === "agent" && input.policy.risk_mode === "off") {
    warnings.push({
      field: "policy.risk_mode",
      code: "agent_without_checks",
      message:
        "agent cards should use block_only or strict so the vault checks the registry, including sanctions reports, before paying",
    });
  }
  return warnings;
}
