import type { MotionProps } from "motion/react";

/** Fades an element in the first time it scrolls into view. */
export const reveal: MotionProps = {
  viewport: { once: true, margin: "-60px" },
  initial: "hidden",
  whileInView: "visible",
  variants: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { type: "spring", stiffness: 500, damping: 200, delay: 0.1 },
    },
  },
};
