import Link from "next/link";

import { globalLinks } from "~/constants";

const links = [
  {
    text: "GitHub",
    href: globalLinks.githubLink,
    target: "_blank",
  },
  {
    text: "Explorer",
    href: globalLinks.explorerUrl,
    target: "_blank",
  },
  {
    text: "Report a vulnerability",
    href: globalLinks.securityAdvisoryLink,
    target: "_blank",
  },
];

export const Footer = () => {
  return (
    <footer className="bg-[transparent] border-t border-grey-200 dark:border-grey-600 mx-4 sm:mx-6 md:mx-[72px] md:px-4 pt-8 pb-10 md:pb-14 flex flex-col md:flex-row md:justify-between gap-14">
      <p className="text-sm text-grey-400 dark:text-grey-300 flex-shrink-0">
        © {new Date().getFullYear()} Comatocard
      </p>

      <nav>
        <ul className="flex flex-col justify-end md:flex-row flex-wrap gap-4 md:gap-8 text-sm">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                className="text-sm text-grey-400 dark:text-grey-300"
                href={link.href}
                target={link.target}
              >
                {link.text}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
};
