"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void; theme: "auto" }) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_ID = "cloudflare-turnstile";

export function TurnstileField({ onToken }: { onToken: (token: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    onToken("");
    if (!siteKey || !target.current) return;
    let active = true;
    const render = () => {
      if (!active || !target.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(target.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) render();
    else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.append(script);
      }
      script.addEventListener("load", render);
      return () => {
        active = false;
        script?.removeEventListener("load", render);
        if (widget.current) window.turnstile?.remove(widget.current);
        widget.current = null;
      };
    }
    return () => {
      active = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={target} className="min-h-16" aria-label="Human verification" />;
}
