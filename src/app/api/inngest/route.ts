import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { cleanupRetainedData, generateWiki, retryFailedPages } from "@/inngest/functions/generate";
import { writeWikiPage } from "@/inngest/functions/write-page";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [generateWiki, writeWikiPage, retryFailedPages, cleanupRetainedData] });
