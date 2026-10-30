import Link from "next/link";
import { listPublicWikis } from "@/lib/wiki-store";

export async function RecentWikis() {
  const wikis = await listPublicWikis(6);
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recent public wikis</h2>
            <p className="mt-2 text-sm text-muted-foreground">Explore documentation created from public repositories.</p>
          </div>
          <Link href="/wikis" className="text-sm underline underline-offset-4">Browse all wikis</Link>
        </div>
        {wikis.length ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wikis.map((wiki) => (
              <li key={`${wiki.owner}/${wiki.name}`}>
                <Link href={`/wiki/${wiki.owner}/${wiki.name}`} className="block rounded-xl border bg-card p-4 hover:border-foreground/30">
                  <span className="font-medium">{wiki.owner}/{wiki.name}</span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{wiki.description ?? `${wiki.pageCount} wiki pages`}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-8 text-sm text-muted-foreground">Generated public wikis will appear here.</p>}
      </div>
    </section>
  );
}
