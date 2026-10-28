"use client";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Spotlight } from "@/components/aceternity/spotlight";
import { TextGenerateEffect } from "@/components/aceternity/text-generate-effect";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { WikiPreview } from "./wiki-preview";

export function HeroSection({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-b">
      <Spotlight className="-top-40 left-0 md:-top-24 md:left-48" fill="currentColor" />
      <BackgroundBeams className="opacity-40" />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 pb-24 pt-24 text-center">
        <p className="mb-6 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">pinned to the commit you shipped</p>
        <TextGenerateEffect
          words="Your codebase, written up the way you'd explain it to a new hire"
          className="max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl"
        />
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-6 max-w-xl text-lg text-muted-foreground">
          Shadow reads your repository and publishes a wiki: architecture, data flow, diagrams, and every claim linked to the exact line it came from. Ask it questions when the page isn&apos;t enough.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {signedIn ? (
            <Link href="/profile">
              <Button size="lg">Open your repositories <ArrowRight /></Button>
            </Link>
          ) : (
            <SignInButton />
          )}
          <a href="#how">
            <Button size="lg" variant="ghost">How it works</Button>
          </a>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.7 }} className="mt-16 w-full">
          <WikiPreview />
        </motion.div>
      </div>
    </section>
  );
}
