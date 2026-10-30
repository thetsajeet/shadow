"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function WikiError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    toast.error("We couldn't load this wiki. Please try again.");
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-muted-foreground">Something went wrong while loading this wiki.</p>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
