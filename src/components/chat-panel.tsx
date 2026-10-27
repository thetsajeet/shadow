"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, FileCode, Loader2, Search, Send, Square, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";

const SUGGESTIONS = [
  "What does this project do and how is it structured?",
  "Where is the main entry point and what happens on startup?",
  "How do I run the tests?",
];

function Answer({ text, owner, repo }: { text: string; owner: string; repo: string }) {
  return (
    <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) =>
            href.startsWith(`/wiki/${owner}/${repo}`) ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
          pre: ({ children }) => {
            const code = (children as { props?: { children?: unknown } })?.props?.children;
            return (
              <div className="group relative not-prose my-3 overflow-hidden rounded-lg border bg-[#f6f8fa] dark:bg-[#0d1117]">
                <pre className="overflow-x-auto p-3 text-xs">{children}</pre>
                <CopyButton text={typeof code === "string" ? code.replace(/\n$/, "") : ""} />
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ToolChip({ part }: { part: { type: string; state?: string; input?: Record<string, unknown> } }) {
  const name = part.type.replace(/^tool-/, "");
  const arg = String(part.input?.query ?? part.input?.path ?? part.input?.prefix ?? "");
  const running = part.state !== "output-available" && part.state !== "output-error";
  const Icon = name === "search_code" ? Search : FileCode;
  return (
    <span className="mr-1.5 mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
      {running ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
      <span className="truncate">
        {name.replace("_", " ")}
        {arg && `: ${arg}`}
      </span>
    </span>
  );
}

export function ChatPanel({ owner, repo }: { owner: string; repo: string }) {
  const [transport] = useState(() => {
    const conv: { id?: string } = {};
    return new DefaultChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        conv.id = res.headers.get("x-conversation-id") ?? conv.id;
        return res;
      },
      prepareSendMessagesRequest: ({ messages }) => ({ body: { owner, repo, messages, conversationId: conv.id } }),
    });
  });
  const { messages, sendMessage, status, stop, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4">
      <div className="flex-1 space-y-6 overflow-y-auto py-8">
        {messages.length === 0 && (
          <div className="mt-16 text-center">
            <Bot className="mx-auto size-10 text-violet-500" />
            <h1 className="mt-4 text-2xl font-bold">Ask about {owner}/{repo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Answers are grounded in the code and cite exact lines.</p>
            <div className="mt-6 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} className="rounded-lg border px-4 py-2 text-left text-sm transition hover:bg-muted">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
              {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4 text-violet-500" />}
            </div>
            <div className="min-w-0 flex-1">
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap pt-0.5 text-sm">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
              ) : (
                <>
                  <div>{m.parts.filter((p) => p.type.startsWith("tool-")).map((p, i) => <ToolChip key={i} part={p as never} />)}</div>
                  {m.parts.map((p, i) => (p.type === "text" ? <Answer key={i} text={p.text} owner={owner} repo={repo} /> : null))}
                </>
              )}
            </div>
          </div>
        ))}
        {status === "submitted" && <Loader2 className="ml-10 size-4 animate-spin text-muted-foreground" />}
        {error && <p className="ml-10 text-sm text-red-500">Something went wrong. Please try again.</p>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex gap-2 border-t bg-background py-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this codebase…"
          maxLength={2000}
          className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => stop()} aria-label="Stop">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
