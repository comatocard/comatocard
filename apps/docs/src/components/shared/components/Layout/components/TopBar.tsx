"use client";

import { IconGitHub } from "../../Icons";
import { Search } from "../../Search";
import { ThemeToggle } from "../../ThemeToggle";

export const TopBar: React.FC = () => (
  <nav className="flex items-center justify-end gap-2 px-5 py-5 sm:py-8 md:px-[72px]">
    <Search />
    <ThemeToggle className="hidden sm:flex" />
    <a
      href="https://github.com/comatocard/comatocard"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Comatocard on GitHub"
      className="w-10 h-10 flex shrink-0 items-center justify-center"
    >
      <IconGitHub className="w-[28px] h-[28px] text-black dark:text-white" />
    </a>
  </nav>
);
