import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  return { rules: { userAgent: "*", allow: "/", disallow: ["/profile", "/api/"] }, sitemap: `${base}/sitemap.xml` };
}
