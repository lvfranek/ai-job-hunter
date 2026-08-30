import { cookies } from "next/headers";
import { DEMO_COOKIE_NAME } from "@/lib/auth";
import { DemoBanner } from "@/components/DemoBanner";

// Server component: reads the (httpOnly) demo cookie and mounts the banner only
// for guest sessions. Rendered unconditionally from the root layout.
export async function DemoModeBanner() {
  const isDemo = (await cookies()).get(DEMO_COOKIE_NAME)?.value === "1";
  return isDemo ? <DemoBanner /> : null;
}
