"use client";
import Image from "next/image";
import { DigitSwap } from "../motion/digit-swap";

/**
 * The face of a Comatocard card, drawn for the card-folder sleeve.
 *
 * The concentric contours start off-card on purpose, so only their curves are in frame. Everything
 * else is the card's real data: its number is the vault's card id, the bottom line is its label,
 * the expiry is the policy's `expires_at`, and the corner names what holds it (a person, an agent
 * or the treasury). Nothing on the face is invented.
 */
const CONTOUR_RADII = Array.from({ length: 12 }, (_, index) => 78 + index * 34);

const KIND_LABEL = { human: "Person", agent: "Agent", treasury: "Treasury" } as const;

export function CardArtwork({
  label,
  number,
  expiry,
  kind,
  frozen,
  detailsVisible,
}: {
  label: string;
  /** 16 digits, the padded card id. */
  number: string;
  expiry: string;
  kind: keyof typeof KIND_LABEL;
  frozen: boolean;
  detailsVisible: boolean;
}) {
  const groups = number.match(/.{1,4}/g) ?? [];
  const value = detailsVisible ? groups.join(" ") : `•••• •••• •••• ${groups[3] ?? "••••"}`;

  return (
    <span className="relative block h-full w-full overflow-hidden bg-[linear-gradient(135deg,#2b2d2b_0%,#17181a_46%,#0b0c0d_100%)] text-white">
      <svg aria-hidden="true" viewBox="0 0 640 404" className="absolute inset-0 h-full w-full">
        <title>Card texture</title>
        {CONTOUR_RADII.map((radius, index) => (
          <circle
            key={radius}
            cx="-20"
            cy="-28"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15 - index * 0.008}
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgb(255_255_255/0.12),transparent_34%)]" />

      <span className="absolute left-[7%] top-[13%] h-[19%] w-[12.5%] overflow-hidden rounded-[18%] border border-black/30 bg-[linear-gradient(135deg,#f0ece2_0%,#b6b2a8_45%,#e2ded2_100%)]">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/30" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-black/30" />
        <span className="absolute inset-x-0 bottom-1/3 h-px bg-black/30" />
        <span className="absolute left-0 top-1/2 h-[34%] w-[28%] -translate-y-1/2 rounded-r-[35%] border border-l-0 border-black/30" />
        <span className="absolute right-0 top-1/2 h-[34%] w-[28%] -translate-y-1/2 rounded-l-[35%] border border-r-0 border-black/30" />
      </span>

      <span className="absolute right-[6%] top-[11%] flex items-center gap-1.5">
        <Image
          src="/comatocard-icon.svg"
          alt=""
          width={512}
          height={512}
          className="h-[18px] w-[18px]"
        />
        <span className="text-[11px] font-semibold tracking-[-0.02em] text-white/85">
          Comatocard
        </span>
      </span>

      <span className="absolute left-[7%] top-[37%] block">
        <DigitSwap
          value={value}
          animationKey={detailsVisible ? "revealed" : "masked"}
          direction={detailsVisible ? "up" : "down"}
          suffixLength={4}
          glyphClassName={detailsVisible ? "text-white/90" : "text-white/60"}
          suffixClassName="text-white/90"
          className="font-mono text-[13px] tracking-[0.12em]"
        />
      </span>

      <span className="absolute bottom-[7%] left-[7%] flex items-end gap-5">
        <span className="flex flex-col gap-1">
          <span className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">
            Card
          </span>
          <span className="max-w-[185px] truncate text-[11px] font-medium uppercase tracking-[0.055em] text-white/90">
            {label}
          </span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">
            Expires
          </span>
          <span className="text-[11px] font-medium tabular-nums text-white/90">{expiry}</span>
        </span>
      </span>

      <span className="absolute bottom-[7%] right-[6%] text-[15px] font-semibold tracking-[-0.02em] text-white/95">
        {KIND_LABEL[kind]}
      </span>

      {frozen ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[rgb(180_200_230/0.28)] [backdrop-filter:blur(1.5px)]">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
            Frozen
          </span>
        </span>
      ) : null}
    </span>
  );
}
