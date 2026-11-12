"use client";
import { useRef } from "react";
import { BuiltOn } from "../components/landing/BuiltOn";
import { ChatDemo } from "../components/landing/ChatDemo";
import { Decisions } from "../components/landing/Decisions";
import { Faq } from "../components/landing/Faq";
import { AroundTheClock, AskPay, ToppedUp } from "../components/landing/Features";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { Numbers } from "../components/landing/Numbers";
import { Pillars } from "../components/landing/Pillars";
import { Proof } from "../components/landing/Proof";
import { SetItUp } from "../components/landing/SetItUp";
import { Story } from "../components/landing/Story";
import { useFloat, useScrollReveal } from "../lib/motion/scroll";

/** The landing page: what Comatocard is, in one scroll, and the way into the app at `/connect`. */
export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  useScrollReveal(root);
  useFloat(root);
  return (
    <div ref={root} className="bg-white">
      <Hero />
      <BuiltOn />
      <main>
        <ChatDemo />
        <Story />
        <ToppedUp />
        <AskPay />
        <AroundTheClock />
        <SetItUp />
        <Decisions />
        <Pillars />
        <Numbers />
        <Proof />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
