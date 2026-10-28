"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    toast.error("We couldn't load your repositories. Please try again.");
  }, []);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-muted-foreground">Something went wrong while loading your profile.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
