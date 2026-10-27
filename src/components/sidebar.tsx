"use client";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Item {
  slug: string;
  title: string;
}

export function Sidebar({ base, items, active }: { base: string; items: Item[]; active: string }) {
  const [open, setOpen] = useState(false);
  const list = (
    <ul className="space-y-0.5">
      {items.map((p) => (
        <li key={p.slug}>
          <Link
            href={`${base}/${p.slug}`}
            onClick={() => setOpen(false)}
            className={cn(
              "relative block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              active === p.slug ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {active === p.slug && <motion.span layoutId="sidebar-active" className="absolute inset-0 -z-10 rounded-md bg-muted" />}
            {p.title}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <button type="button" aria-label="Toggle menu" className="fixed bottom-4 left-4 z-40 rounded-full border bg-background p-3 shadow-lg lg:hidden" onClick={() => setOpen((o) => !o)}>
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 overflow-y-auto border-r bg-background p-4 pt-20 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:pt-6",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {list}
      </aside>
    </>
  );
}
