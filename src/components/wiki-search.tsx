"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface SearchResult {
  slug: string;
  title: string;
  summary: string;
}

export function WikiSearch({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLoading(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else setOpen(true);
      } else if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKeyDown);
    trigger?.setAttribute("data-shortcuts-ready", "true");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.removeAttribute("data-shortcuts-ready");
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/wiki/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Wiki search failed");
        const data = await response.json() as { results: SearchResult[] };
        setResults(data.results);
        setActive(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [owner, query, repo]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Search wiki (Control or Command K)">
        <Search className="size-3.5" /><span className="hidden sm:inline">Search</span><kbd className="hidden rounded border px-1 font-mono sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 px-3 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Search wiki"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), a[href]");
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
            className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim().length < 2) {
                    setResults([]);
                    setLoading(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && results.length) { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
                  if (e.key === "ArrowUp" && results.length) { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
                  if (e.key === "Enter" && results[active]) {
                    router.push(`/wiki/${owner}/${repo}/${results[active].slug}`);
                    close();
                  }
                }}
                placeholder="Search pages…"
                aria-label="Search wiki pages"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="wiki-search-results"
                aria-autocomplete="list"
                aria-activedescendant={results[active] ? `wiki-search-option-${active}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button onClick={close} className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close search"><X className="size-4" /></button>
            </div>
            <ul id="wiki-search-results" role="listbox" aria-label="Wiki search results" className="max-h-[55vh] overflow-y-auto p-2">
              {loading && <li className="px-3 py-5 text-sm text-muted-foreground" role="status">Searching…</li>}
              {!loading && query.length >= 2 && results.length === 0 && <li className="px-3 py-5 text-sm text-muted-foreground">No matching pages.</li>}
              {results.map((result, index) => (
                <li id={`wiki-search-option-${index}`} key={result.slug} role="option" aria-selected={active === index}>
                  <Link onClick={close} href={`/wiki/${owner}/${repo}/${result.slug}`} className={`block rounded-lg px-3 py-2.5 ${active === index ? "bg-muted" : "hover:bg-muted/60"}`}>
                    <span className="block text-sm font-medium">{result.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{result.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Use ↑ ↓ to navigate · Enter to open · Esc to close</p>
          </section>
        </div>
      )}
    </>
  );
}
