"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EASE, gsap } from "../../lib/motion/gsap";
import { useFloat, useScrollReveal } from "../../lib/motion/scroll";
import { CardScene } from "./CardScene";
import { ChatDemo } from "./ChatDemo";
import { Closing } from "./Closing";
import { Finality } from "./Finality";
import { Hero } from "./Hero";
import { NAV_ITEMS, SECTION } from "./links";
import { Nav } from "./Nav";
import { Proof } from "./Proof";
import { AroundTheClock, AskPay, Safety, ToppedUp } from "./Sections";
import { SmoothScroll } from "./SmoothScroll";
import { Steps } from "./Steps";

type Phase = "idle" | "playing" | "done";

const SWIPE = 40;
/** Wheel deltas that must add up at the top before the intro comes back. */
const UP_RELEASE = 120;
/** Ignore upward wheel this long after landing back at the top, so momentum does not snap back. */
const TOP_SETTLE_MS = 400;
const TOP = 2;
/** When, in seconds into the video, the card scene starts to come up behind it. */
const SCENE_AT = 2;

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -96 });
  else el.scrollIntoView({ behavior: "smooth" });
}

/** Everything below the intro; it mounts only once the intro is done. */
function Content() {
  const root = useRef<HTMLElement>(null);
  useScrollReveal(root);
  useFloat(root);
  return (
    <main
      ref={root}
      className="relative z-[4] overflow-hidden rounded-t-[40px] bg-[#F4F0ED] md:rounded-t-[72px]"
    >
      <ChatDemo />
      <ToppedUp />
      <AskPay />
      <AroundTheClock />
      <Safety />
      <Steps />
      <Finality />
      <Proof />
      <Closing />
    </main>
  );
}

/** Follows the last section whose top has passed under the nav; the end of the page is the FAQ. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string>(SECTION.safety);
  useEffect(() => {
    if (!enabled) {
      setActive(SECTION.safety);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current: string = SECTION.safety;
      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.target);
        if (el && el.getBoundingClientRect().top <= 240) current = item.target;
      }
      setActive(atBottom ? SECTION.faq : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return active;
}

/**
 * The landing page. It opens on the hero; the first scroll down plays the card video full screen
 * while the page is held at one viewport, the card scene comes up behind it, and the rest of the
 * page opens when the video ends. Scrolling up from the very top brings the hero back.
 */
export function Landing() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sceneVisible, setSceneVisible] = useState(false);
  const [imagesVisible, setImagesVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);
  const done = phase === "done";
  const active = useActiveSection(done);

  const start = useCallback(() => {
    const el = video.current;
    if (!el) return;
    setPhase("playing");
    setSceneVisible(false);
    setImagesVisible(false);
    el.currentTime = 0;
    void el.play().catch(() => {
      // Autoplay refused: skip straight to the open page rather than hang on a still.
      setPhase("done");
      setSceneVisible(true);
      setImagesVisible(true);
    });
  }, []);

  const reset = useCallback(() => {
    const el = video.current;
    setPhase("idle");
    setSceneVisible(false);
    setImagesVisible(false);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }, []);

  /** Open the page without playing the intro, for nav clicks. */
  const release = useCallback(() => {
    const el = video.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPhase("done");
    setSceneVisible(true);
    setImagesVisible(true);
  }, []);

  const navigate = useCallback(
    (id: string) => {
      setMenuOpen(false);
      if (done) {
        requestAnimationFrame(() => scrollToId(id));
        return;
      }
      pending.current = id;
      release();
    },
    [done, release],
  );

  // A nav click made during the intro scrolls once the content has mounted and settled.
  useEffect(() => {
    if (!done || !pending.current) return;
    const id = pending.current;
    pending.current = null;
    const timer = window.setTimeout(() => scrollToId(id), 120);
    return () => window.clearTimeout(timer);
  }, [done]);

  // The video and the hero cross over through GSAP.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(video.current, {
        opacity: phase === "playing" ? 1 : 0,
        duration: 0.5,
        ease: EASE.out,
      });
      gsap.to(hero.current, { autoAlpha: phase === "idle" ? 1 : 0, duration: 0.7, ease: EASE.out });
    });
    return () => ctx.revert();
  }, [phase]);

  useEffect(() => {
    if (menuOpen) window.__lenis?.stop();
    else window.__lenis?.start();
  }, [menuOpen]);

  // Wheel and swipe: down from the hero starts the intro, up from the top brings it back.
  useEffect(() => {
    let upAccum = 0;
    let leftTopAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (phase === "idle") {
        if (e.deltaY > 0) start();
        return;
      }
      if (phase !== "done") return;
      if (e.deltaY >= 0) {
        upAccum = 0;
        return;
      }
      if (window.scrollY > TOP) {
        upAccum = 0;
        leftTopAt = performance.now();
        return;
      }
      if (performance.now() - leftTopAt < TOP_SETTLE_MS) return;
      upAccum += -e.deltaY;
      if (upAccum >= UP_RELEASE) {
        upAccum = 0;
        reset();
      }
    };
    let startY = 0;
    let startScroll = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
      startScroll = window.scrollY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const delta = startY - (e.changedTouches[0]?.clientY ?? startY);
      if (delta > SWIPE && phase === "idle") start();
      else if (delta < -SWIPE && phase === "done" && startScroll <= TOP && window.scrollY <= TOP)
        reset();
    };
    const onKey = (e: KeyboardEvent) => {
      if (phase === "idle" && ["ArrowDown", "PageDown", " "].includes(e.key)) release();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, start, reset, release]);

  return (
    <div className="relative min-h-[100svh] overflow-x-clip bg-[#F4F0ED]">
      <SmoothScroll />
      <div className="relative h-[100svh] overflow-hidden">
        <CardScene visible={sceneVisible} imagesVisible={imagesVisible} />
        <video
          ref={video}
          src="/landing/intro.mp4"
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
          onTimeUpdate={(e) => {
            if (phase === "playing" && e.currentTarget.currentTime >= SCENE_AT)
              setSceneVisible(true);
          }}
          onEnded={() => {
            setPhase("done");
            setImagesVisible(true);
          }}
          className="pointer-events-none fixed inset-0 z-[2] h-full w-full object-cover opacity-0"
        />
        <div ref={hero} className="absolute inset-0 z-[3]">
          <Hero />
          {phase === "idle" ? (
            <button
              type="button"
              onClick={release}
              className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[12px] font-medium tracking-[0.2em] text-white/60 uppercase transition-colors hover:text-white"
            >
              Scroll
            </button>
          ) : null}
        </div>
      </div>
      {done ? <Content /> : null}
      <Nav
        dark={done || sceneVisible}
        active={active}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onNavigate={navigate}
      />
    </div>
  );
}
