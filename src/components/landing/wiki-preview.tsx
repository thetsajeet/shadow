/** A static, hand-built impression of a generated wiki page. */
export function WikiPreview() {
  const nav = ["Overview", "Architecture", "Data flow", "Auth", "Background jobs", "Local setup"];
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border bg-card text-left shadow-2xl shadow-foreground/5">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">shadow / acme / billing-api</span>
        <span className="ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">main @ 4f9c2ab</span>
      </div>
      <div className="grid md:grid-cols-[13rem_1fr_11rem]">
        <ul className="hidden space-y-0.5 border-r p-3 text-sm md:block">
          {nav.map((n, i) => (
            <li key={n} className={`rounded-md px-2.5 py-1.5 ${i === 1 ? "bg-muted font-medium" : "text-muted-foreground"}`}>{n}</li>
          ))}
        </ul>
        <article className="space-y-3 p-6 text-sm">
          <h3 className="text-xl font-semibold tracking-tight">Architecture</h3>
          <p className="text-muted-foreground">
            Requests enter through the Fastify gateway, which authenticates the caller and hands the invoice to the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">LedgerService</code> (
            <span className="text-foreground underline decoration-dotted underline-offset-2">src/ledger/service.ts#L42-L88</span>).
          </p>
          <pre className="overflow-hidden rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-muted-foreground">{`graph LR
  Client --> Gateway --> LedgerService
  LedgerService --> Postgres[(Postgres)]
  LedgerService --> Queue{{Retry queue}}`}</pre>
          <p className="text-muted-foreground">Failed charges are retried with exponential backoff before the customer is notified.</p>
        </article>
        <aside className="hidden space-y-1.5 border-l p-4 text-xs text-muted-foreground md:block">
          <p className="mb-2 font-medium text-foreground">On this page</p>
          <p>Request lifecycle</p>
          <p className="text-foreground">Ledger</p>
          <p>Retries</p>
          <p>Failure modes</p>
        </aside>
      </div>
    </div>
  );
}
