import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../src/db/schema";
import { pruneRetainedRepositoryData } from "../../src/lib/retention";

const owner = `e2e-${Date.now()}`;
const repo = "public-wiki";
const client = postgres(process.env.DATABASE_URL ?? "postgres://shadow:shadow@127.0.0.1:5432/shadow", { max: 1 });
const database = drizzle(client, { schema });

test("landing page exposes the public wiki directory and walkthrough video", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Explore wikis" })).toHaveAttribute("href", "/wikis");
  await expect(page.getByTitle("Shadow product walkthrough")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/hqqT7hgJaLI/);
});

test("landing page stays usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test.describe.serial("public wiki experience", () => {
  test.beforeAll(async () => {
    await database.delete(schema.repos).where(eq(schema.repos.owner, owner));
    const [record] = await database.insert(schema.repos).values({
      owner,
      name: repo,
      defaultBranch: "main",
      visibility: "public",
    }).returning();
    const [generation] = await database.insert(schema.generations).values({
      repoId: record.id,
      commitSha: "0123456789abcdef",
      branch: "main",
      status: "done",
      finishedAt: new Date(),
    }).returning();
    await database.update(schema.repos).set({ currentGenerationId: generation.id }).where(eq(schema.repos.id, record.id));
    await database.insert(schema.pages).values({
      generationId: generation.id,
      slug: "payments",
      title: "Payment and refund flow",
      summary: "Explains how a refund is processed.",
      position: 0,
      status: "done",
      markdown: "# Payment and refund flow\n\nThe refund handler validates the charge before returning the payment.",
    });
  });

  test.afterAll(async () => {
    await database.delete(schema.repos).where(eq(schema.repos.owner, owner));
    await client.end();
  });

  test("retention prunes an expired generation using postgres-js date parameters", async () => {
    const cleanupOwner = `${owner}-retention`;
    const [record] = await database.insert(schema.repos).values({
      owner: cleanupOwner,
      name: repo,
      defaultBranch: "main",
      visibility: "public",
    }).returning();
    const [generation] = await database.insert(schema.generations).values({
      repoId: record.id,
      commitSha: "expired-generation",
      branch: "main",
      startedAt: new Date(Date.now() - 10_000),
    }).returning();

    await pruneRetainedRepositoryData(new Date());

    expect(await database.select().from(schema.generations).where(eq(schema.generations.id, generation.id))).toHaveLength(0);
    await database.delete(schema.repos).where(eq(schema.repos.id, record.id));
  });

  test("search, metadata, discovery text, and export work end to end", async ({ page }) => {
    await page.goto(`/wiki/${owner}/${repo}`);
    await expect(page.getByRole("heading", { name: "Payment and refund flow", exact: true })).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Explains how a refund is processed.");

    await expect(page.getByRole("button", { name: /Search wiki/ })).toHaveAttribute("data-shortcuts-ready", "true");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    const searchResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/wiki/${owner}/${repo}/search?q=refund`),
      { timeout: 15_000 },
    );
    await page.getByRole("combobox", { name: "Search wiki pages" }).fill("refund");
    const response = await searchResponse;
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      results: [expect.objectContaining({ slug: "payments", title: "Payment and refund flow" })],
    });
    await expect(page.getByRole("option", { name: /Payment and refund flow/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("option", { name: /Payment and refund flow/ }).click();
    await expect(page.getByRole("heading", { name: "Payment and refund flow", exact: true })).toBeVisible();

    const llms = await page.request.get(`/wiki/${owner}/${repo}/llms.txt`);
    expect(llms.ok()).toBe(true);
    expect(await llms.text()).toContain("Payment and refund flow");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain(`${owner}-${repo}`);

    await page.route("**/api/chat", async (route) => {
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "mock-answer" });
          writer.write({ type: "text-delta", id: "mock-answer", delta: "Mocked answer grounded in the test wiki." });
          writer.write({ type: "text-end", id: "mock-answer" });
        },
      });
      const response = createUIMessageStreamResponse({ stream });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto(`/wiki/${owner}/${repo}/chat`);
    await page.getByRole("textbox", { name: "Ask a question about this codebase" }).fill("How are refunds processed?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Mocked answer grounded in the test wiki.")).toBeVisible();
  });
});
