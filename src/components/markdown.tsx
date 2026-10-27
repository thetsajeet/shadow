import { isValidElement, type ReactNode } from "react";
import { MarkdownAsync } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { codeToHtml } from "shiki";
import { CopyButton } from "./copy-button";
import { Mermaid } from "./mermaid";

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

async function Pre({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const lang = /language-([\w+-]+)/.exec(code?.props.className ?? "")?.[1] ?? "text";
  const text = textOf(code?.props.children ?? children).replace(/\n$/, "");
  if (lang === "mermaid") return <Mermaid chart={text} />;
  let html: string;
  try {
    html = await codeToHtml(text, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
  } catch {
    html = await codeToHtml(text, { lang: "text", themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
  }
  return (
    <div className="group relative not-prose my-4 overflow-hidden rounded-lg border bg-[#f6f8fa] dark:bg-[#0d1117]">
      <div className="shiki-wrap overflow-x-auto p-4 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButton text={text} />
    </div>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <MarkdownAsync
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "append", properties: { className: ["anchor"], ariaLabel: "Link to section" }, content: { type: "text", value: "#" } }],
      ]}
      components={{
        pre: Pre,
        a: ({ href, children, className }) => (
          <a href={href} className={className} {...(href?.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {source}
    </MarkdownAsync>
  );
}
