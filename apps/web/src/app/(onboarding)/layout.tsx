"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";

/** Setup runs full screen: behind a connected wallet, without the app's navigation. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
