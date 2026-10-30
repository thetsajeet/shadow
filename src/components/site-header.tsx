import Link from "next/link";
import { SignInButton } from "./sign-in-button";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function SiteHeader({ user }: { user: { login: string; image: string | null } | null }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="font-semibold tracking-tight">Shadow</Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/wikis" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">Explore wikis</Link>
          <ThemeToggle />
          {user ? <UserMenu login={user.login} image={user.image} /> : <SignInButton size="default" label="Sign in" />}
        </div>
      </div>
    </header>
  );
}
