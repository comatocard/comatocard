import Image from "next/image";
import { InfoTip } from "../ui";

const PILLARS = [
  {
    title: "Limits it can't change",
    body: "Only you can change them.",
    tip: "Per payment, per day and per 30 days, checked by the vault contract on every payment. A card key can only call pay.",
    icon: "/landing/lock.png",
    wide: true,
  },
  {
    title: "Checks the payee",
    body: "Blocked accounts are refused.",
    tip: "Each card can screen the merchant against the registry: refuse blocked accounts, or only pay known ones.",
    icon: "/landing/shield.png",
    wide: false,
  },
  {
    title: "Cards for anyone",
    body: "Hand a card to anyone.",
    tip: "An agent, a person or a treasury. Each card is its own key with its own limits.",
    icon: "/landing/profile.png",
    wide: false,
  },
  {
    title: "Every payment on record",
    body: "Every attempt, with its reason.",
    tip: "Paid, waiting for you or refused: each attempt emits an event the indexer keeps, with the reason code.",
    icon: "/landing/network.png",
    wide: true,
  },
] as const;

/** What every card guarantees, one tile each; the detail sits behind the info tip. */
export function Pillars() {
  return (
    <section className="bg-white px-5 pb-24 lg:pb-32">
      <ul className="mx-auto grid max-w-[1180px] gap-4 md:grid-cols-5">
        {PILLARS.map((p) => (
          <li
            key={p.title}
            data-scroll
            className={`relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-[28px] bg-[#f5f5f4] p-7 ${p.wide ? "md:col-span-3" : "md:col-span-2"}`}
          >
            <Image
              data-float
              src={p.icon}
              alt=""
              width={360}
              height={360}
              className="absolute top-6 right-6 w-24 lg:w-32"
            />
            <h3 className="flex items-center gap-1.5 text-[20px] font-semibold tracking-[-.01em]">
              {p.title}
              <InfoTip label={p.title}>{p.tip}</InfoTip>
            </h3>
            <p className="mt-1 text-[14px] text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
