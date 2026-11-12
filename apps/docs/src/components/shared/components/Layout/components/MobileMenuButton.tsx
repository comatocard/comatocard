import clsx from "clsx";
import { motion, type Transition, type Variants } from "framer-motion";

type PathProps = { d?: string; variants: Variants; transition?: Transition };

const Path = ({ d, variants, transition }: PathProps) => (
  <motion.path
    fill="transparent"
    strokeWidth="2"
    stroke="currentColor"
    strokeLinecap="round"
    d={d}
    variants={variants}
    transition={transition}
  />
);

interface MobileMenuButtonProps {
  toggle: () => void;
  className?: string;
  isOpen: boolean;
}

export const MobileMenuButton: React.FC<MobileMenuButtonProps> = ({
  className,
  toggle,
  isOpen,
  ...otherProps
}) => (
  <motion.nav
    initial={false}
    animate={isOpen ? "open" : "closed"}
    className={clsx(
      "flex items-center justify-center h-[23px] md:h-[36px] text-black dark:text-white",
      className,
    )}
  >
    <button type="button" onClick={toggle} {...otherProps}>
      <svg aria-hidden="true" width="25" height="25" viewBox="0 0 23 23">
        <Path
          variants={{
            open: { d: "M 3 16.5 L 17 2.5" },
            closed: { d: "M 2 2.5 L 20 2.5" },
          }}
        />
        <Path
          d="M 2 9.423 L 20 9.423"
          variants={{
            closed: { opacity: 1 },
            open: { opacity: 0 },
          }}
          transition={{ duration: 0.1 }}
        />
        <Path
          variants={{
            closed: { d: "M 2 16.346 L 20 16.346" },
            open: { d: "M 3 2.5 L 17 16.346" },
          }}
        />
      </svg>
    </button>
  </motion.nav>
);
