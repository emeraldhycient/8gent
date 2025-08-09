import * as cheerio from 'cheerio';
import { ChatOpenAI } from '@langchain/openai';
import { JOB_EXTRACTION_SYSTEM, buildJobExtractionUserPrompt } from '../prompts';

export const DEFAULT_UA = 'Mozilla/5.0 (AgentScraperUtils)';

export const miniModel = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });

export async function fetchHtml(url: string, ua = DEFAULT_UA): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

export function clean(text: string | undefined | null, limit = 50000): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim().slice(0, limit);
}

export function discoverLinks($: cheerio.CheerioAPI, base: URL, cap = 10): string[] {
  const out = new Set<string>();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || href.startsWith('#')) return;
    try {
      const u = new URL(href, base);
      if (u.hostname === base.hostname) out.add(u.toString());
    } catch {}
  });
  return Array.from(out).slice(0, cap);
}

export function isLikelyJobPosting(url: string, job: { title: string | null; description: string | null }): boolean {
  const title = job.title?.toLowerCase() || '';
  const desc = job.description || '';
  if (!title || title.length < 4) return false;
  const genericTitleRe = /\b(careers?|jobs?|open positions?|join our team)\b/i;
  if (genericTitleRe.test(job.title || '') && desc.length < 800) return false;
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

export async function extractJobStructured(model: ChatOpenAI, url: string, html: string) {
  const truncated = html.slice(0, 18000);
  try {
    const resp: any = await model.invoke([
      { role: 'system', content: JOB_EXTRACTION_SYSTEM },
      { role: 'user', content: buildJobExtractionUserPrompt(truncated) }
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

export async function summarizeDescription(model: ChatOpenAI, desc: string | null, summarize: boolean) {
  if (!desc || !summarize) return null;
  try {
    const r: any = await model.invoke(`Summarize job description in 3 concise bullet points:\n${desc.slice(0, 6000)}`);
    return typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
  } catch { return null; }
}
