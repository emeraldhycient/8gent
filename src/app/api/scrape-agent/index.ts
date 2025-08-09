import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, BaseMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as cheerio from "cheerio";
import { randomUUID } from "crypto";
import { upsertLink, markCrawled, getUncrawledBatch, upsertJob } from "../../../lib/db";

const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });

const SYSTEM_PROMPT = `You are a focused job scraping agent.
Input: A set of seed URLs (job postings or careers listing pages).
Objectives:
1. Crawl in-domain pages (bounded depth) starting from seeds.
2. Extract ONLY individual job posting pages (single role) with structured fields.
3. Store structured jobs via database helper tool calls.
4. Return a concise JSON summary of scraped postings.

Definitions:
- Individual job posting: page whose primary content is one role with clear description & requirements + apply CTA.
- Exclusions: generic careers landing pages, category/listing indexes, multi-role tables, search pages.

Strategy:
- Maintain a queue (links table) seeded by URLs.
- Respect maxDepth & limit arguments from tool.
- Heuristics filter pages before persisting to jobs table.
- Provide isPosting flag for each crawled page.
`;

const scrapeJobsTool = new DynamicStructuredTool({
  name: "scrape_jobs",
  description: "Crawl seed URLs, discover in-domain links, and extract ONLY individual job posting pages with structured metadata.",
  schema: z.object({
    urls: z.array(z.string().url()).min(1).max(25),
    maxDepth: z.number().int().min(0).max(3).default(1),
    limit: z.number().int().min(1).max(120).default(40),
    summarize: z.boolean().default(true),
  }),
  func: async ({ urls, maxDepth, limit, summarize }) => {
    const model = llm;
    const UA = "Mozilla/5.0 (ScrapeAgent)";
    const clean = (t?: string | null) => (t ? t.replace(/\s+/g, " ").trim().slice(0, 50000) : null);

    async function fetchHtml(url: string) {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }

    function isLikelyJobPosting(url: string, job: { title: string | null; description: string | null }) {
      const title = job.title?.toLowerCase() || "";
      const desc = job.description || "";
      if (!title || title.length < 4) return false;
      const genericTitleRe = /\b(careers?|jobs?|open positions?|join our team)\b/i;
      if (genericTitleRe.test(job.title || "") && desc.length < 800) return false;
      if (!desc || desc.length < 120) return false;
      const keywordHits = (desc.match(/apply|responsibilit|requirement|qualification|benefit|salary|compensation/gi) || []).length;
      if (keywordHits < 2) return false;
      try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const pathDepth = path.split('/').filter(Boolean).length;
        if (pathDepth < 2 && !/[0-9]/.test(path)) {
          if (desc.length < 1500) return false;
        }
      } catch {}
      return true;
    }

    async function extractJob(url: string, html: string) {
      const truncated = html.slice(0, 18000);
      const sys = `You are a specialized parser that extracts structured job posting data from raw HTML. Return strict JSON.`;
      const user = `Extract the following fields if present. Focus on structured extraction for a job application assistant.\n\nTop-level keys:\n- title (string)\n- company (string)\n- location (string) (primary location or main if multiple)\n- description (long normalized text, join major sections)\n- metadata (object)\n\nmetadata may include (ONLY include keys that are present or strongly implied):\n# Core listing basics\n- employment_type (e.g. full-time, part-time, contract, internship, freelance)\n- seniority (e.g. junior, mid, senior, staff, principal, lead, director)\n- posted_date (ISO 8601 if possible)\n- application_deadline (ISO 8601 if present)\n- internal_job_id\n- application_link (direct URL if distinct from page)\n- application_instructions (string)\n- contact_email\n- contact_phone\n- referral_bonus (boolean or description)\n- ats_system (e.g. Greenhouse, Lever)\n\n# Compensation & benefits\n- salary (string raw)\n- salary_min (number)\n- salary_max (number)\n- salary_interval (e.g. yearly, hourly, monthly)\n- compensation_currency (e.g. USD, EUR)\n- equity (string or range)\n- bonus (string)\n- benefits (array of short strings)\n- benefits_detailed (array long strings)\n- relocation (boolean or description)\n- visa_sponsorship (boolean)\n- remote (boolean)\n- remote_policy (string)\n- timezone_overlap (string)\n- travel_requirements (string)\n\n# Role & responsibilities\n- responsibilities (array of bullet strings)\n- qualifications (array of bullet strings)\n- mandatory_skills (array)\n- nice_to_have_skills (array)\n- tech_stack (array of technologies)\n- tools (array)\n- methodologies (array)\n- kpis (array)\n- team_size (number or string)\n- reporting_line (e.g. 'Reports to VP Engineering')\n- interview_process (array steps)\n- start_date (string or ISO if given)\n- contract_length (string)\n- schedule (string e.g. 'Mon-Fri', shift pattern)\n- language_requirements (array)\n- security_clearance (string)\n- work_authorization_required (string)\n- experience_required (string)\n- years_experience_min (number)\n- years_experience_max (number)\n- education (string)\n- education_required (string)\n\n# Company & context\n- company_size (string or range)\n- industry (string)\n- funding_stage (string)\n- mission (string)\n- diversity_statement (string)\n- glassdoor_rating (number if explicit)\n- departments (array)\n- locations (array of strings)\n- tags (array)\n\n# Auto-apply support\n- required_documents (array: resume, cover_letter, portfolio, references, transcripts, code_samples, github, linkedin)\n- screening_questions (array)\n- auto_reject_criteria (array)\n- application_portal_type (e.g. 'LinkedIn', 'Greenhouse', 'Proprietary')\n\nReturn ONLY strict JSON: {"title":..., "company":..., "location":..., "description":..., "metadata":{...}}.\nIf a field unknown, omit it or set null (avoid placeholders). Use arrays for lists. Do not include commentary.\n\nHTML:\n----------------\n${truncated}\n----------------`;
      try {
        const resp: any = await model.invoke([
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ] as any);
        let text: string;
        const content = resp.content;
        if (Array.isArray(content)) {
          const first = content.find((c: any) => typeof c.text === 'string');
          text = first ? first.text : JSON.stringify(content);
        } else if (typeof content === 'string') text = content; else text = JSON.stringify(content);
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s === -1 || e === -1) throw new Error('No JSON');
        const parsed = JSON.parse(text.slice(s, e + 1));
        return {
          title: clean(parsed.title),
          company: clean(parsed.company),
          location: clean(parsed.location),
          description: clean(parsed.description),
          metadata: parsed.metadata || null,
        };
      } catch {
        return { title: null, company: null, location: null, description: null, metadata: null };
      }
    }

    async function summarizeDesc(desc: string | null) {
      if (!desc || !summarize) return null;
      try {
        const r: any = await model.invoke(`Summarize job description in 3 concise bullet points:\n${desc.slice(0, 6000)}`);
        return typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
      } catch { return null; }
    }

    function discoverLinks($: cheerio.CheerioAPI, base: URL) {
      const out = new Set<string>();
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href || href.startsWith('#')) return;
        try {
          const u = new URL(href, base);
          if (u.hostname === base.hostname) out.add(u.toString());
        } catch {}
      });
      return Array.from(out).slice(0, 10);
    }

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
          const job = await extractJob(url, html);
          const isPosting = isLikelyJobPosting(url, { title: job.title, description: job.description });
          const discovered = depth < maxDepth ? discoverLinks($, new URL(url)) : [];
          const summary = await summarizeDesc(job.description);
          if (isPosting) {
            await upsertJob({
              title: job.title,
              url,
              company: job.company,
              location: job.location,
              description: job.description,
              summary,
              metadata: job.metadata,
            });
          }
          await markCrawled(url);
          await Promise.all(discovered.map(d => upsertLink(d, url, depth + 1)));
          return { url, ...job, summary, discoveredLinks: discovered, isPosting };
        } catch (e: any) {
          return { url, error: e?.message || 'fetch_fail' };
        }
      }));
      for (const p of processed) if (p) results.push(p);
    }
    return JSON.stringify({ count: results.filter(j => j.isPosting).length, jobs: results.filter(j => j.isPosting).slice(0, 60), crawled: results.length });
  }
});

const tools = [scrapeJobsTool];
const toolNode = new ToolNode(tools);

const callModel = async (state: typeof MessagesAnnotation.State) => {
  const { messages } = state;
  const llmWithTools = llm.bindTools(tools);
  const result = await llmWithTools.invoke(messages);
  return { messages: [result] };
};

const shouldContinue = (state: typeof MessagesAnnotation.State) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage._getType() !== 'ai' || !(lastMessage as AIMessage).tool_calls?.length) {
    return END;
  }
  return 'tools';
};

const workflow = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addEdge(START, 'agent')
  .addNode('tools', toolNode)
  .addEdge('tools', 'agent')
  .addConditionalEdges('agent', shouldContinue, ['tools', END]);

export async function runScrapeAgent(seeds: string[], opts?: { maxDepth?: number; limit?: number; summarize?: boolean; threadId?: string }) {
  const app = workflow.compile({ checkpointer: new MemorySaver() });
  const initialMessages: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify({ action: 'scrape', seeds, options: opts || {} }))
  ];
  const id = opts?.threadId || randomUUID();
  const result = await app.invoke({ messages: initialMessages }, { configurable: { thread_id: id } });
  return result.messages;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seeds: string[] = body.urls || [];
    if (!Array.isArray(seeds) || !seeds.length) {
      return new Response(JSON.stringify({ error: 'urls array required' }), { status: 400 });
    }
    const messages = await runScrapeAgent(seeds, { maxDepth: body.maxDepth, limit: body.limit, summarize: body.summarize });
    return new Response(JSON.stringify(messages), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), { status: 500 });
  }
}

export const runtime = 'nodejs';
