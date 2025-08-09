import { TavilySearch } from "@langchain/tavily";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { upsertLink, upsertJob, markCrawled, getUncrawledBatch } from "../db";
import { ChatOpenAI } from "@langchain/openai";
import * as cheerio from 'cheerio';
import { fetchHtml, extractJobStructured, summarizeDescription, discoverLinks } from "../scrape/utils";

// Web search tool (Tavily)
export function createWebSearchTool() {
	return new TavilySearch();
}

// Logging tool used by search agent to seed discovered job links
export function createLogResultTool() {
	return new DynamicStructuredTool({
		name: 'log_final_job_results',
		description: 'Log the final compiled list of job openings (title and url). Call ONLY once after you finish searching.',
		schema: z.object({
			results: z.array(z.object({
				title: z.string(),
				url: z.string().url()
			})).min(1)
		}),
		func: async ({ results }) => {
			let inserted = 0;
			for (const r of results) {
				try { await upsertLink(r.url, 'agent_seed', 0); inserted++; } catch {}
			}
			return `Logged ${results.length} jobs (seeded ${inserted}).`;
		}
	});
}

// Scrape jobs tool reused by scrape-agent (refactored to shared utilities)
export function createScrapeJobsTool(model = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 })) {
	return new DynamicStructuredTool({
		name: 'scrape_jobs',
		description: 'Crawl seed URLs, discover in-domain links, and extract ONLY individual job posting pages with structured metadata.',
		schema: z.object({
			urls: z.array(z.string().url()).min(1).max(25),
			maxDepth: z.number().int().min(0).max(3).default(1),
			limit: z.number().int().min(1).max(150).default(50),
			summarize: z.boolean().default(true)
		}),
		func: async ({ urls, maxDepth, limit, summarize }) => {
			await Promise.all(urls.map(u => upsertLink(u, null, 0)));
			const results: any[] = [];
			while (results.length < limit) {
				const batch = await getUncrawledBatch(Math.min(8, limit - results.length));
				if (!batch.length) break;
				const processed = await Promise.all(batch.map(async ({ url, depth }: { url: string; depth: number }) => {
					try {
						if (depth > maxDepth) { await markCrawled(url); return null; }
						const html = await fetchHtml(url);
						const $ = cheerio.load(html);
						const job = await extractJobStructured(model, url, html);
						const canDiscover = depth < maxDepth;
						const discovered = canDiscover ? discoverLinks($, new URL(url)) : [];
						const summary = await summarizeDescription(model, job.description, summarize);
						await upsertJob({ title: job.title, url, company: job.company, location: job.location, description: job.description, summary, metadata: job.metadata });
						await markCrawled(url);
						await Promise.all(discovered.map(d => upsertLink(d, url, depth + 1)));
						return { url, ...job, summary, discoveredLinks: discovered };
					} catch (e: any) {
						return { url, error: e?.message || 'fetch_fail' };
					}
				}));
				for (const p of processed) if (p) results.push(p);
			}
			return JSON.stringify({ count: results.length, jobs: results.slice(0, 60) });
		}
	});
}
