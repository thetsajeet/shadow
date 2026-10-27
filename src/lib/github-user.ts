import { mapError, octokit } from "./github";

export interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string;
}

export interface OwnedRepo {
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stars: number;
  defaultBranch: string;
  pushedAt: string | null;
  htmlUrl: string;
}

export async function fetchProfile(token: string): Promise<GithubProfile> {
  try {
    const { data } = await octokit(token).rest.users.getAuthenticated();
    return {
      id: data.id,
      login: data.login,
      name: data.name,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
      bio: data.bio,
      company: data.company,
      location: data.location,
      blog: data.blog || null,
      followers: data.followers,
      following: data.following,
      publicRepos: data.public_repos,
      createdAt: data.created_at,
    };
  } catch (e) {
    throw mapError(e, "reading your GitHub profile");
  }
}

/** Repositories the user owns (public and private), most recently pushed first. Forks and archived repos are skipped. */
export async function fetchOwnedRepos(token: string, limit = 100): Promise<OwnedRepo[]> {
  try {
    const out: OwnedRepo[] = [];
    const o = octokit(token);
    const it = o.paginate.iterator(o.rest.repos.listForAuthenticatedUser, {
      affiliation: "owner",
      sort: "pushed",
      per_page: 100,
    });
    for await (const { data } of it) {
      for (const r of data) {
        if (r.fork || r.archived) continue;
        out.push({
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          private: r.private,
          language: r.language,
          stars: r.stargazers_count ?? 0,
          defaultBranch: r.default_branch,
          pushedAt: r.pushed_at,
          htmlUrl: r.html_url,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch (e) {
    throw mapError(e, "listing your repositories");
  }
}
