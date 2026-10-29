"use client";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Item {
  slug: string;
  title: string;
}

export function Sidebar({ base, items, active }: { base: string; items: Item[]; active: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
      if (event.key !== "Tab" || !drawer.current) return;
      const focusable = [...drawer.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const list = (
    <ul className="space-y-0.5">
      {items.map((p) => (
        <li key={p.slug}>
          <Link
            href={`${base}/${p.slug}`}
            onClick={() => setOpen(false)}
            aria-current={active === p.slug ? "page" : undefined}
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
      <button ref={trigger} type="button" aria-label={open ? "Close wiki navigation" : "Open wiki navigation"} aria-expanded={open} aria-controls="wiki-mobile-navigation" className="fixed bottom-4 left-4 z-40 rounded-full border bg-background p-3 shadow-lg lg:hidden" onClick={() => setOpen((o) => !o)}>
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r bg-background p-4 pt-6 lg:block">{list}</aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden">
          <button type="button" aria-label="Close wiki navigation" className="absolute inset-0 size-full cursor-default" onClick={() => setOpen(false)} />
          <aside ref={drawer} id="wiki-mobile-navigation" role="dialog" aria-modal="true" aria-label="Wiki navigation" className={cn("relative z-10 h-full w-72 overflow-y-auto border-r bg-background p-4 pt-20 shadow-xl")}>
            {list}
          </aside>
        </div>
      )}
    </>
  );
}
