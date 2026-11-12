import Link from "next/link";
import { Wordmark } from "../onboarding/SetupLayout";
import { LINKS, SECTIONS } from "./links";

const COMPANY = [
  { label: "GitHub", href: LINKS.repo },
  { label: "Docs", href: LINKS.docs },
  { label: "Compliance", href: LINKS.compliance },
  { label: "NEAR", href: LINKS.near },
] as const;

const linkClass = "text-[14px] text-muted transition-colors hover:text-ink";

export function Footer() {
  return (
    <footer className="border-t border-line bg-[#f7f7f5] px-5 pt-14 pb-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 text-[14px] text-muted">
              Payment cards for agents, enforced on NEAR.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-[13px] font-semibold">Product</p>
            <ul className="mt-3 space-y-2">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={linkClass}>
                    {s.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href={LINKS.app} className={linkClass}>
                  Open the app
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="text-[13px] font-semibold">Company</p>
            <ul className="mt-3 space-y-2">
              {COMPANY.map((c) => (
                <li key={c.label}>
                  <a href={c.href} className={linkClass} target="_blank" rel="noreferrer">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-[12px] text-muted sm:flex-row sm:justify-between">
          <p>© 2026 Comatocard · MIT · Built at NEAR Hackathon</p>
          <p>Testnet only. No real funds.</p>
        </div>
      </div>
    </footer>
  );
}
