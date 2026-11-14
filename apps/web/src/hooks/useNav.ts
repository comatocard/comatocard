"use client";
import { useRouter } from "next/navigation";

/**
 * App navigation helper. `forward` navigates into a sub-screen; the app layout slides the new
 * page in with GSAP, so call sites need not know about it. `back` pops history. Reuse instead of
 * calling `router.push`/`router.back` directly.
 */
export function useNav() {
  const router = useRouter();
  return {
    forward: (href: string) => router.push(href),
    back: () => router.back(),
  };
}
