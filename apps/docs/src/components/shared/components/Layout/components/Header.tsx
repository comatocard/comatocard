"use client";

import { Toolbar } from "@mui/material";
import clsx from "clsx";
import Link from "next/link";

import { IconDocsLogo } from "../../Icons";
import { MobileMenuButton } from "./MobileMenuButton";

/** Mobile header with the wordmark and the menu button. */
export const Header: React.FC<{
  isLeftDrawerOpen: boolean;
  toggleDrawerOpen: () => void;
  setIsLeftDrawerOpen: (isOpen: boolean) => void;
}> = ({ isLeftDrawerOpen, toggleDrawerOpen, setIsLeftDrawerOpen }) => (
  <Toolbar className="sm:hidden fixed z-[100] flex items-stretch w-full p-0 bg-grey-50 dark:bg-grey-900">
    <div
      className={clsx("flex items-center justify-between flex-grow p-4", {
        "border-b border-grey-200 dark:border-grey-700": !isLeftDrawerOpen,
      })}
    >
      <Link href="/" onClick={() => setIsLeftDrawerOpen(false)}>
        <IconDocsLogo className="text-green-700 dark:text-grey-50" />
      </Link>

      <MobileMenuButton
        className="mt-1.5 text-black dark:text-grey-50"
        isOpen={isLeftDrawerOpen}
        toggle={toggleDrawerOpen}
      />
    </div>
  </Toolbar>
);
