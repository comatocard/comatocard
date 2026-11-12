interface GetRevealPropsArgs {
  y?: number;
  x?: number;
  delay?: number;
  opacity?: number;
  scale?: number;
  transitionType?: string;
  duration?: number;
}

export const getRevealProps = ({
  y = 24,
  x = 0,
  delay = 0.1,
  opacity = 1,
  scale = 1,
  transitionType = "spring",
}: GetRevealPropsArgs) => ({
  viewport: { once: true, margin: "-60px" },
  initial: "hidden",
  whileInView: "visible",
  variants: {
    hidden: {
      opacity: 0,
      y,
      x,
      scale,
    },
    visible: {
      opacity,
      y: 0,
      x: 0,
      scale: 1,
      transition: {
        type: transitionType,
        stiffness: 500,
        damping: 200,
        delay,
      },
    },
  },
});

// oposite of reveal props
