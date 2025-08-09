import { runAgent } from "../../../lib/agent/utils";
import { SCRAPE_AGENT_SYSTEM_PROMPT } from "../../../lib/prompts";
import { createScrapeJobsTool } from "../../../lib/tools";
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });

export async function runScrapeAgent(seeds: string[], opts?: { maxDepth?: number; limit?: number; summarize?: boolean; threadId?: string }) {
  const tool = createScrapeJobsTool(llm);
  return await runAgent({
    systemPrompt: SCRAPE_AGENT_SYSTEM_PROMPT,
    userPrompt: JSON.stringify({ action: 'scrape', seeds, options: opts || {} }),
    tools: [tool],
    threadId: opts?.threadId,
    llm,
  });
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
