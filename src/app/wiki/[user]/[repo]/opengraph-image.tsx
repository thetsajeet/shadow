import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { readMeta } from "@/lib/wiki-store";

export const alt = "Shadow repository wiki";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ user: string; repo: string }> }) {
  await connection();
  const { user, repo } = await params;
  const meta = await readMeta(user, repo, null);
  const title = meta ? `${meta.repo} wiki` : "Codebase documentation";
  const subtitle = meta ? `${meta.branch} · ${meta.sha.slice(0, 7)} · ${meta.pages.length} pages` : "Understand your codebase with Shadow";
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 72, flexDirection: "column", justifyContent: "space-between", background: "#111827", color: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa" }}>SHADOW · SOURCE-LINKED CODE WIKIS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 30, color: "#d4d4d8" }}>{subtitle}</div>
      </div>
    </div>,
    size,
  );
}
