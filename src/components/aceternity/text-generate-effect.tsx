"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Aceternity-style Text Generate Effect */
export function TextGenerateEffect({ words, className }: { words: string; className?: string }) {
  return (
    <div className={cn("font-bold", className)}>
      {words.split(" ").map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          initial={{ opacity: 0, filter: "blur(8px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, delay: 0.08 * i }}
          className="inline-block"
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </div>
  );
}
