"use client";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function UserMenu({ login, image }: { login: string; image: string | null }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Link href="/profile" className="flex items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-3 text-sm hover:bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" className="size-6 rounded-full" /> : <span className="size-6 rounded-full bg-muted" />}
        {login}
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
