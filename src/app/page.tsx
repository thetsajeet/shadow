import { connection } from "next/server";
import { Suspense } from "react";
import { HeroSection } from "@/components/landing/hero-section";
import { Features, HowItWorks, SiteFooter } from "@/components/landing/sections";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/current-user";

async function Landing() {
  await connection();
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user ? { login: user.githubLogin, image: user.image } : null} />
      <main>
        <HeroSection signedIn={!!user} />
        <Features />
        <HowItWorks />
      </main>
      <SiteFooter />
    </>
  );
}

export default function Home() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}
