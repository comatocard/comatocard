"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { basePath } from "~/lib/app.constants";

import { IconSearch } from "./Icons";

const MAX_PAGES = 8;

type Hit = { url: string; title: string; excerpt: string };
type Group = { title: string; hits: Hit[] };

type PagefindResult = {
  url: string;
  excerpt: string;
  meta: { title?: string };
  sub_results?: { url: string; title: string; excerpt: string }[];
};
type Pagefind = {
  debouncedSearch: (query: string) => Promise<{
    results: { data: () => Promise<PagefindResult> }[];
  } | null>;
};

// The index is written by `pagefind` after `next build`, so it only exists in built output.
let pagefind: Promise<Pagefind> | undefined;
const loadPagefind = () => {
  pagefind ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ `${basePath}/_pagefind/pagefind.js`
  );
  return pagefind;
};

/** Excerpt text with Pagefind's `<mark>` highlights, as text nodes instead of injected HTML. */
const Excerpt = ({ html }: { html: string }) => {
  const text = (part: string) =>
    new DOMParser().parseFromString(part, "text/html").body.textContent;
  return (
    <>
      {html.split(/<\/?mark>/).map((part, i) =>
        // Odd parts sat between <mark> and </mark>.
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one excerpt never reorder
        i % 2 ? <mark key={i}>{text(part)}</mark> : <span key={i}>{text(part)}</span>,
      )}
    </>
  );
};

const groupsOf = (results: PagefindResult[]): Group[] =>
  results.map((result) => ({
    title: result.meta.title ?? result.url,
    hits: result.sub_results?.length
      ? result.sub_results.map((sub) => ({ url: sub.url, title: sub.title, excerpt: sub.excerpt }))
      : [{ url: result.url, title: result.meta.title ?? result.url, excerpt: result.excerpt }],
  }));

export const Search: React.FC = () => {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = groups.flatMap((g) => g.hits);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    loadPagefind()
      .then((index) => index.debouncedSearch(term))
      .then(async (search) => {
        if (!search || cancelled) return;
        const data = await Promise.all(search.results.slice(0, MAX_PAGES).map((r) => r.data()));
        if (cancelled) return;
        setGroups(groupsOf(data));
        setActive(0);
        setState("idle");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const reset = () => {
    setOpen(false);
    setQuery("");
  };

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    reset();
    router.push(hit.url);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") setActive((i) => Math.min(i + 1, hits.length - 1));
    else if (event.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
    else if (event.key === "Enter") go(hits[active]);
    else if (event.key === "Escape") setOpen(false);
    else return;
    event.preventDefault();
  };

  const showPanel = open && query.trim() !== "";
  let position = -1;

  return (
    <div ref={box} className="docs-search relative block w-full sm:w-[250px]">
      <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-grey-300 dark:text-grey-400" />
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search documentation"
        placeholder="Search"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          loadPagefind().catch(() => setState("error"));
        }}
        onKeyDown={onKeyDown}
        className="w-full appearance-none border border-grey-100 dark:border-grey-700 bg-grey-100 dark:bg-grey-700 rounded-full px-4 py-2 pl-10 pr-[102px] text-[14px] leading-[130%] text-black dark:text-white placeholder:text-grey-400 dark:placeholder:text-grey-300 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute top-full z-20 mt-2 -right-[96px] lg:right-0 w-screen max-w-[calc(100vw-32px)] sm:max-w-[min(calc(100vw-248px),500px)] max-h-[400px] min-h-[100px] overflow-auto overscroll-contain rounded-xl bg-white dark:bg-[#111] py-2.5 shadow-xl"
        >
          {state === "error" && (
            <p className="px-5 py-3 text-sm text-red-400">Failed to load search index.</p>
          )}
          {state === "loading" && !hits.length && (
            <p className="px-5 py-3 text-sm text-grey-400">Loading…</p>
          )}
          {state === "idle" && !hits.length && (
            <p className="px-5 py-3 text-center text-sm text-grey-400">No results found.</p>
          )}
          {groups.map((group) => (
            <div key={group.title}>
              <div
                aria-hidden="true"
                className="mx-2.5 mb-2 mt-6 first:mt-0 select-none border-b border-black/10 dark:border-white/20 px-2.5 pb-1.5 text-xs font-semibold uppercase text-grey-400 dark:text-grey-300"
              >
                {group.title}
              </div>
              {group.hits.map((hit) => {
                position += 1;
                const index = position;
                return (
                  <Link
                    key={hit.url}
                    href={hit.url}
                    role="option"
                    aria-selected={index === active}
                    className={clsx("mx-2.5 block break-words rounded-md scroll-m-12 px-2.5 py-2", {
                      "bg-grey-100 dark:bg-grey-700": index === active,
                    })}
                    onMouseMove={() => setActive(index)}
                    onClick={reset}
                  >
                    <div className="text-base font-semibold leading-5 text-black dark:text-white">
                      {hit.title}
                    </div>
                    <div className="mt-1 text-sm leading-[1.35rem] text-grey-400 dark:text-grey-300">
                      <Excerpt html={hit.excerpt} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
