import { z } from "zod";
import * as cheerio from "cheerio";
import { upsertLink, markCrawled, getUncrawledBatch, upsertJob } from "../../../lib/db";
import { ChatOpenAI } from "@langchain/openai";
import { fetchHtml, extractJobStructured, summarizeDescription, discoverLinks, llmFilterLinks } from "../../../lib/scrape/utils";

// Schema for incoming POST body
const BodySchema = z.object({
  urls: z.array(z.string().url()).min(1, "At least one URL required"),
  maxDepth: z.number().int().min(0).max(3).default(1),
  limit: z.number().int().min(1).max(200).default(Infinity),
  summarize: z.boolean().optional().default(true),
});

interface ScrapeResult {
  url: string;
  success: boolean;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  summary?: string | null;
  metadata?: Record<string, any> | null;
  rawLength?: number;
  error?: string;
  discoveredLinks?: string[];
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const summarizer = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

async function scrapeOne(url: string, currentDepth: number, maxDepth: number, doSummarize: boolean): Promise<ScrapeResult> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
  const job = await extractJobStructured(summarizer, url, html);
    const canDiscover = currentDepth < maxDepth;
    let discovered: string[] = [];
    if (canDiscover) {
      const raw = discoverLinks($, new URL(url), 25);
      // LLM filtering for job-relevant links
      discovered = await llmFilterLinks(summarizer, url, raw);
    }
    // persist job (summary later)
    let summary: string | null = null;
    if (doSummarize) {
  summary = await summarizeDescription(summarizer, job.description, true);
    }
  await upsertJob({
      title: job.title,
      url,
      company: job.company,
      location: job.location,
      description: job.description,
      summary,
      metadata: job.metadata,
    });
  await markCrawled(url);
    // enqueue discovered links
    for (const link of discovered) {
  await upsertLink(link, url, currentDepth + 1);
    }
    return {
  url,
  success: true,
  ...job,
  summary,
  rawLength: html.length,
  discoveredLinks: discovered,
  metadata: job.metadata,
    };
  } catch (e: any) {
    return { url, success: false, error: e?.message || String(e) };
  }
}

async function crawlSeeds(seeds: string[], maxDepth: number, limit: number, doSummarize: boolean): Promise<ScrapeResult[]> {
  // seed insertion
  for (const s of seeds) await upsertLink(s, null, 0);
  const results: ScrapeResult[] = [];
  while (results.length < limit) {
  const batch = await getUncrawledBatch(10);
    if (!batch.length) break;
    const slice = batch.slice(0, Math.min(10, limit - results.length));
    const chunk = await Promise.all(
      slice.map((entry: { url: string; depth: number }) =>
        scrapeOne(entry.url, entry.depth, maxDepth, doSummarize)
      )
    );
    results.push(...chunk);
  }
  return results;
}

async function crawlFromExisting(maxDepth: number, limit: number, doSummarize: boolean): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  while (results.length < limit) {
    const remaining = limit - results.length;
  const batch = await getUncrawledBatch(Math.min(10, remaining));
    if (!batch.length) break;
    const chunk = await Promise.all(
      batch.map((entry: { url: string; depth: number }) =>
        scrapeOne(entry.url, entry.depth, maxDepth, doSummarize)
      )
    );
    results.push(...chunk);
  }
  return results;
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
  const parsed = BodySchema.parse(data);
  const results = await crawlSeeds(parsed.urls, parsed.maxDepth, parsed.limit, parsed.summarize);
    return new Response(
      JSON.stringify({ count: results.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    const status = e?.name === "ZodError" ? 400 : 500;
    return new Response(
      JSON.stringify({ error: e?.message || "Unknown error" }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET /api/scrape?maxDepth=1&limit=25&summarize=true
// Crawls starting from existing uncrawled links already stored in the DB.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const maxDepth = parseInt(url.searchParams.get('maxDepth') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const summarizeParam = url.searchParams.get('summarize');
    const summarize = summarizeParam == null ? true : /^(1|true|yes)$/i.test(summarizeParam);

    if (isNaN(maxDepth) || maxDepth < 0 || maxDepth > 3) {
      return new Response(JSON.stringify({ error: 'Invalid maxDepth' }), { status: 400 });
    }
    if (isNaN(limit) || limit < 1 || limit > 500) {
      return new Response(JSON.stringify({ error: 'Invalid limit' }), { status: 400 });
    }

    const results = await crawlFromExisting(maxDepth, limit, summarize);
    return new Response(
      JSON.stringify({ mode: 'existing', count: results.length, results }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const runtime = "nodejs"; // ensure Node APIs (cheerio) ok
