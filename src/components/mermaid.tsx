"use client";
import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

export function Mermaid({ chart }: { chart: string }) {
  const id = "mmd-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
        });
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        document.getElementById("d" + id)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  if (failed) {
    return (
      <div className="not-prose my-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">Diagram could not be rendered; showing source.</p>
        <pre className="overflow-x-auto text-xs">{chart}</pre>
      </div>
    );
  }
  if (!svg) return <div className="not-prose my-4 h-24 animate-pulse rounded-lg bg-muted" />;
  return <div className="not-prose my-6 flex justify-center overflow-x-auto rounded-lg border bg-card p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}
