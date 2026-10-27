"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const paths = Array.from({ length: 18 }, (_, i) => {
  const o = i * 22;
  return `M-${380 - o} -${189 + i * 6}C-${380 - o} -${189 + i * 6} -${312 - o} ${216 - i * 6} ${152 - o} ${343 - i * 6}C${616 - o} ${470 - i * 6} ${684 - o} ${875 - i * 6} ${684 - o} ${875 - i * 6}`;
});

/** Aceternity-style Background Beams */
export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]", className)}>
      <svg className="absolute h-full w-full" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        {paths.map((d, i) => (
          <motion.path key={i} d={d} stroke={`url(#beam-${i})`} strokeOpacity="0.5" strokeWidth="0.5" />
        ))}
        <defs>
          {paths.map((_, i) => (
            <motion.linearGradient
              key={i}
              id={`beam-${i}`}
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{ x1: ["0%", "100%"], x2: ["0%", "95%"], y1: ["0%", "100%"], y2: ["0%", `${93 + (i % 7)}%`] }}
              transition={{ duration: 8 + (i % 6) * 2, repeat: Infinity, ease: "easeInOut", delay: (i % 5) * 0.8 }}
            >
              <stop stopColor="#18CCFC" stopOpacity="0" />
              <stop stopColor="#18CCFC" />
              <stop offset="32.5%" stopColor="#6344F5" />
              <stop offset="100%" stopColor="#AE48FF" stopOpacity="0" />
            </motion.linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  );
}
