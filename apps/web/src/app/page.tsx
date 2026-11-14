import { Geist } from "next/font/google";
import { Landing } from "../components/landing/Landing";

/** The landing page's own face: Geist, with the light weight its headlines are set in. */
const geist = Geist({ subsets: ["latin"], weight: ["300", "400", "500", "600"], display: "swap" });

/** The landing page; the app starts at `/connect`, or at the root of its own host in production. */
export default function Page() {
  return (
    <div className={geist.className}>
      <Landing />
    </div>
  );
}
