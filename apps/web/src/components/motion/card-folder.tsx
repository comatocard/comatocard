"use client";
// Vendored from beUI (https://beui.dev/components/blocks/card-folder), MIT.
// Kept close to upstream so it can be re-synced; product styling lives in components/card/.

import { Eye, EyeOff } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { DigitSwap } from "@/components/motion/digit-swap";
import { EASE_IN_OUT, EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";

// The two purse layers collapse as one material surface after the card starts
// moving, then reverse immediately so closing feels like the card is caught.
const PURSE_MORPH_TRANSITION = {
  duration: 0.28,
  ease: EASE_IN_OUT,
} as const;
const PURSE_REDUCED_TRANSITION = {
  duration: 0.16,
  ease: EASE_OUT,
} as const;

export interface CardFolderProps {
  title: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  /** Label of the expiry slot in the pocket. */
  expiryLabel?: string;
  /** Label of the masked slot in the pocket, the CVV on a bank card. */
  secretLabel?: string;
  card: ReactNode;
  detailsVisible?: boolean;
  defaultDetailsVisible?: boolean;
  onDetailsVisibleChange?: (visible: boolean) => void;
  ariaLabel?: string;
  className?: string;
  cardClassName?: string;
}

/**
 * A landscape card tucked into an animated folder sleeve. Pressing the folder
 * lifts the card forward while the purse compresses into its bottom seam; a
 * separate privacy control reveals its number and CVV.
 */
export function CardFolder({
  title,
  cardNumber,
  expiry,
  cvv,
  expiryLabel = "Expiry",
  secretLabel = "CVV",
  card,
  detailsVisible,
  defaultDetailsVisible = false,
  onDetailsVisibleChange,
  ariaLabel,
  className,
  cardClassName,
}: CardFolderProps) {
  const reduce = useReducedMotion();
  const [isOpen, setOpen] = useState(false);
  const [internalDetailsVisible, setInternalDetailsVisible] = useState(defaultDetailsVisible);
  const detailsControlled = detailsVisible !== undefined;
  const areDetailsVisible = detailsVisible ?? internalDetailsVisible;
  const normalizedCardNumber = cardNumber.replace(/\D/g, "");
  const visibleLastFour = normalizedCardNumber.slice(-4).padStart(4, "•");
  const revealedCardNumber = normalizedCardNumber.match(/.{1,4}/g)?.join(" ") ?? visibleLastFour;
  const maskedCvv = "•".repeat(Math.max(3, cvv.length));
  const defaultAriaLabel = `${isOpen ? "Close" : "Open"} ${title}, card ending in ${visibleLastFour}, expires ${expiry}`;
  const progress = useMotionValue(isOpen ? 1 : 0);
  const cardTransform = useTransform(progress, (value) => {
    const boundedProgress = Math.min(1, Math.max(0, value));
    const lift = Math.sin(Math.PI * boundedProgress);
    return `translateY(${-8 * lift}%) scale(${1 + 0.01 * lift})`;
  });
  const backTransform = useTransform(
    progress,
    [0, 1],
    ["translateY(0%) scaleY(1)", "translateY(18%) scaleY(0.18)"],
  );
  const frontTransform = useTransform(
    progress,
    [0, 1],
    ["translateY(0%) rotateX(0deg)", "translateY(18%) rotateX(-72deg)"],
  );
  const purseOpacity = useTransform(progress, [0, 0.76, 1], [1, 1, 0]);

  useEffect(() => {
    const controls = animate(
      progress,
      isOpen ? 1 : 0,
      reduce ? { duration: 0 } : PURSE_MORPH_TRANSITION,
    );
    return () => controls.stop();
  }, [isOpen, progress, reduce]);

  const handleClick = () => setOpen(!isOpen);
  // With reduced motion the purse only fades; otherwise it follows the progress value.
  const purseFade = { animate: { opacity: isOpen ? 0 : 1 } };
  const backMotion = reduce
    ? purseFade
    : { style: { opacity: purseOpacity, transform: backTransform } };
  const frontMotion = reduce
    ? purseFade
    : { style: { opacity: purseOpacity, transform: frontTransform } };
  const cardMotion = reduce
    ? { animate: { transform: "translateY(0%) scale(1)" } }
    : { style: { transform: cardTransform } };
  const press = reduce
    ? { transition: { duration: 0 } }
    : { whileTap: { scale: 0.96 }, transition: SPRING_PRESS };

  const toggleDetails = () => {
    const nextVisible = !areDetailsVisible;
    if (!detailsControlled) setInternalDetailsVisible(nextVisible);
    onDetailsVisibleChange?.(nextVisible);
  };

  return (
    <div
      data-open={String(isOpen)}
      data-details-visible={String(areDetailsVisible)}
      className={cn(
        "relative aspect-[1029/592] w-96 max-w-full select-none [perspective:1200px]",
        className,
      )}
    >
      <motion.button
        type="button"
        aria-label={ariaLabel ?? defaultAriaLabel}
        aria-expanded={isOpen}
        onClick={handleClick}
        {...press}
        className="absolute inset-0 block rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        <motion.span
          data-slot="card-folder-back"
          aria-hidden="true"
          initial={false}
          transition={PURSE_REDUCED_TRANSITION}
          {...backMotion}
          className="absolute inset-x-0 bottom-0 top-[10%] rounded-2xl border border-foreground/10 bg-background [transform-origin:center_bottom]"
        />

        <motion.span
          aria-hidden="true"
          initial={false}
          {...cardMotion}
          className={cn(
            "absolute left-[4.7%] right-[4.7%] top-0 z-10 aspect-[1.586/1] overflow-hidden rounded-xl border border-foreground/10 bg-background [transform-origin:center_bottom] will-change-transform",
            cardClassName,
          )}
        >
          {card}
        </motion.span>
      </motion.button>

      <motion.span
        aria-hidden={isOpen}
        inert={isOpen}
        initial={false}
        transition={PURSE_REDUCED_TRANSITION}
        {...frontMotion}
        className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 z-20 [backface-visibility:hidden] [transform-origin:center_bottom]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 384 110"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <path
            d="M0 17C15 7 31 4 49 4H87C110 4 126 17 144 32L158 44C176 59 206 59 225 43L240 30C257 16 271 4 295 4H335C354 4 370 8 384 18V94C384 103 377 110 368 110H16C7 110 0 103 0 94Z"
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeOpacity="0.12"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M10 21C22 13 35 11 51 11H85C105 11 120 23 137 37L153 50C175 68 208 68 231 49L246 36C262 23 275 11 297 11H333C350 11 363 14 374 22V89C374 97 369 101 360 101H24C15 101 10 96 10 89Z"
            fill="none"
            stroke="var(--foreground)"
            strokeDasharray="5 5"
            strokeLinecap="round"
            strokeOpacity="0.22"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <span className="absolute inset-x-[5%] inset-y-0 z-10 flex min-w-0 flex-col justify-between py-4">
          <span className="flex items-start justify-between pr-2">
            <VisibilityToggle
              visible={areDetailsVisible}
              hidden={isOpen}
              reduce={reduce === true}
              onToggle={toggleDetails}
            />

            <PocketFields
              expiryLabel={expiryLabel}
              expiry={expiry}
              secretLabel={secretLabel}
              secret={areDetailsVisible ? cvv : maskedCvv}
              revealed={areDetailsVisible}
            />
          </span>
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-lg font-medium leading-tight text-foreground">
              {title}
            </span>
            {/* `shrink-0`, and that is the fix rather than a preference. DigitSwap lays every
                  glyph out in a fixed `1ch` slot inside a `whitespace-nowrap` inline-flex, so it
                  has no way to reflow: squeezed by a long name it does not shrink, it gets clipped,
                  and a card number cut to "9924 8604 6558 5" is worse than useless. The number
                  takes the width it needs and the name, which can be abbreviated, yields. */}
            <DigitSwap
              value={areDetailsVisible ? revealedCardNumber : `•••• •••• •••• ${visibleLastFour}`}
              animationKey={areDetailsVisible ? "revealed" : "masked"}
              direction={areDetailsVisible ? "up" : "down"}
              suffixLength={4}
              glyphClassName={areDetailsVisible ? "text-foreground" : "text-muted-foreground"}
              suffixClassName="text-foreground"
              className="shrink-0 font-mono text-[11px] tracking-[0.04em] tabular-nums"
            />
          </span>
        </span>
      </motion.span>
    </div>
  );
}

const ICON_HIDDEN = { opacity: 0, scale: 0.25, filter: "blur(4px)" };

/** The eye in the pocket that shows or hides the card details. */
function VisibilityToggle({
  visible,
  hidden,
  reduce,
  onToggle,
}: {
  visible: boolean;
  hidden: boolean;
  reduce: boolean;
  onToggle: () => void;
}) {
  const fade = reduce ? { opacity: 0 } : ICON_HIDDEN;
  return (
    <motion.button
      type="button"
      {...(hidden ? { tabIndex: -1 } : {})}
      aria-label={visible ? "Hide card details" : "Show card details"}
      aria-pressed={visible}
      onClick={onToggle}
      {...(reduce ? {} : { whileTap: { scale: 0.96 } })}
      transition={reduce ? { duration: 0.12 } : SPRING_PRESS}
      className={cn(
        "z-30 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        hidden ? "pointer-events-none" : "pointer-events-auto",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={visible ? "hide" : "show"}
          initial={fade}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={fade}
          transition={reduce ? { duration: 0.12 } : { type: "spring", duration: 0.3, bounce: 0 }}
          className="flex items-center justify-center"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** The two small fields in the pocket: expiry and the masked slot. */
function PocketFields({
  expiryLabel,
  expiry,
  secretLabel,
  secret,
  revealed,
}: {
  expiryLabel: string;
  expiry: string;
  secretLabel: string;
  secret: string;
  revealed: boolean;
}) {
  const label = "text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65";
  return (
    <span className="flex shrink-0 items-end gap-3.5 pt-2">
      <span className="flex flex-col gap-0.5">
        <span className={label}>{expiryLabel}</span>
        <span className="text-xs font-medium text-foreground tabular-nums">{expiry}</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={label}>{secretLabel}</span>
        <DigitSwap
          value={secret}
          animationKey={revealed ? "revealed" : "masked"}
          direction={revealed ? "up" : "down"}
          className="text-xs font-medium text-foreground tabular-nums"
        />
      </span>
    </span>
  );
}
