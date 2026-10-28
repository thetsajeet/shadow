import { Building2, ExternalLink, Link2, MapPin } from "lucide-react";
import type { GithubProfile } from "@/lib/github-user";

const fmt = new Intl.NumberFormat("en", { notation: "compact" });

export function ProfileHeader({ profile }: { profile: GithubProfile }) {
  const joined = new Date(profile.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" });
  return (
    <section className="flex flex-col gap-6 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={profile.avatarUrl} alt="" width={96} height={96} className="size-24 rounded-full ring-1 ring-border" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{profile.name ?? profile.login}</h1>
          <a href={profile.htmlUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            @{profile.login} <ExternalLink className="size-3" />
          </a>
          <span className="ml-2 font-mono text-xs text-muted-foreground">id {profile.id}</span>
        </div>
        {profile.bio && <p className="max-w-prose text-sm text-muted-foreground">{profile.bio}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {profile.company && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{profile.company}</span>}
          {profile.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{profile.location}</span>}
          {profile.blog && <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{profile.blog.replace(/^https?:\/\//, "")}</span>}
          <span>Joined {joined}</span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-6 text-center sm:text-left">
        {[
          ["Repos", profile.publicRepos],
          ["Followers", profile.followers],
          ["Following", profile.following],
        ].map(([k, v]) => (
          <div key={k}>
            <dd className="text-xl font-semibold tabular-nums">{fmt.format(Number(v))}</dd>
            <dt className="text-xs text-muted-foreground">{k}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
