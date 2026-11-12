import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ClientOnlyPortalProps = {
  children: React.ReactNode;
  selector: string;
};

/** Renders `children` into the element matching `selector` once it exists in the page. */
export const ClientOnlyPortal: React.FC<ClientOnlyPortalProps> = ({ children, selector }) => {
  const [target, setTarget] = useState<Element | null>(null);

  // No dependency list: Nextra re-creates the target element on navigation.
  useEffect(() => {
    const element = document.querySelector(selector);
    if (element !== target) setTarget(element);
  });

  return target ? createPortal(children, target) : null;
};
