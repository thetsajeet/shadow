import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { getCurrentUser } from "@/lib/current-user";
import { safeNext } from "@/lib/safe-next";

async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection();
  const { next } = await searchParams;
  // Only same-origin relative paths are allowed as a post-login target.
  const target = safeNext(next);
  if (await getCurrentUser()) redirect(target);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Shadow</h1>
          <p className="text-sm text-muted-foreground">
            We use GitHub to list your repositories and read their source. Nothing is ever written to them.
          </p>
        </div>
        <SignInButton next={target} />
      </div>
    </main>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}
