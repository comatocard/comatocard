"use client";
import Image from "next/image";
import { useRef } from "react";
import { useMarquee } from "../../lib/motion/scroll";

const LOGOS = [
  { name: "NEAR", src: "/landing/near-white.png", width: 92 },
  { name: "NEAR AI", src: "/landing/near-ai-white.png", width: 104 },
  { name: "NEAR Intents", src: "/landing/near-intents.png", width: 132 },
  { name: "Meteor Wallet", src: "/onboarding/meteor.png", width: 26 },
  { name: "Sputnik DAO", src: null, width: 0 },
] as const;

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-16 pr-16" aria-hidden={hidden || undefined}>
      {LOGOS.map((logo) => (
        <li key={logo.name} className="flex h-8 items-center opacity-80">
          {logo.src ? (
            <Image
              src={logo.src}
              alt={hidden ? "" : logo.name}
              width={logo.width * 2}
              height={64}
              style={{ width: logo.width, height: "auto" }}
            />
          ) : (
            <span className="text-[15px] font-semibold tracking-tight text-white">{logo.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The stack Comatocard runs on, as a slow logo loop. */
export function BuiltOn() {
  const track = useRef<HTMLDivElement>(null);
  useMarquee(track);
  return (
    <section
      aria-label="Built on"
      className="flex items-center gap-8 overflow-hidden bg-[#0b0c0d] py-9"
    >
      <p className="hidden shrink-0 pl-10 text-[13px] font-medium text-white/50 md:block">
        Built on
      </p>
      <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div ref={track} className="flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
