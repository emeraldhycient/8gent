// Centralized prompt definitions

export const SEARCH_AGENT_SYSTEM_PROMPT = `You are an autonomous job-sourcing agent.
Goal: Use the Tavily web search tool repeatedly to discover CURRENT individual job openings.
Instructions:
1. Devise focused queries (company careers + role keywords, specific stacks, remote modifiers, etc.).
2. After each search, collect unique job posting URLs (ignore generic landing pages unless they clearly resolve to a single role page).
3. Continue issuing varied queries until you stop finding NEW unique openings (avoid duplicates by URL or very similar titles).
4. When obvious queries are exhausted (or after ~6 productive searches), produce a FINAL CLEAN LIST.
5. The final list MUST be concise JSON-like bullet lines: Title - URL (no commentary).
6. After producing the final list, invoke the logging tool ONCE to record it.
Return ONLY the clean list before calling the logging tool.`;

export const SCRAPE_AGENT_SYSTEM_PROMPT = `You are a focused job scraping agent.
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
- Provide isPosting flag for each crawled page.`;

// System message for extraction
export const JOB_EXTRACTION_SYSTEM = `You are a specialized parser that extracts structured job posting data from raw HTML. Return strict JSON.`;

// User prompt template for job extraction (HTML truncated externally)
export function buildJobExtractionUserPrompt(truncatedHtml: string) {
  return `Extract the following fields if present. Focus on structured extraction for a job application assistant.\n\nTop-level keys:\n- title (string)\n- company (string)\n- location (string) (primary location or main if multiple)\n- description (long normalized text, join major sections)\n- metadata (object)\n\nmetadata may include (ONLY include keys that are present or strongly implied):\n# Core listing basics\n- employment_type (e.g. full-time, part-time, contract, internship, freelance)\n- seniority (e.g. junior, mid, senior, staff, principal, lead, director)\n- posted_date (ISO 8601 if possible)\n- application_deadline (ISO 8601 if present)\n- internal_job_id\n- application_link (direct URL if distinct from page)\n- application_instructions (string)\n- contact_email\n- contact_phone\n- referral_bonus (boolean or description)\n- ats_system (e.g. Greenhouse, Lever)\n\n# Compensation & benefits\n- salary (string raw)\n- salary_min (number)\n- salary_max (number)\n- salary_interval (e.g. yearly, hourly, monthly)\n- compensation_currency (e.g. USD, EUR)\n- equity (string or range)\n- bonus (string)\n- benefits (array of short strings)\n- benefits_detailed (array long strings)\n- relocation (boolean or description)\n- visa_sponsorship (boolean)\n- remote (boolean)\n- remote_policy (string)\n- timezone_overlap (string)\n- travel_requirements (string)\n\n# Role & responsibilities\n- responsibilities (array of bullet strings)\n- qualifications (array of bullet strings)\n- mandatory_skills (array)\n- nice_to_have_skills (array)\n- tech_stack (array of technologies)\n- tools (array)\n- methodologies (array)\n- kpis (array)\n- team_size (number or string)\n- reporting_line (e.g. 'Reports to VP Engineering')\n- interview_process (array steps)\n- start_date (string or ISO if given)\n- contract_length (string)\n- schedule (string e.g. 'Mon-Fri', shift pattern)\n- language_requirements (array)\n- security_clearance (string)\n- work_authorization_required (string)\n- experience_required (string)\n- years_experience_min (number)\n- years_experience_max (number)\n- education (string)\n- education_required (string)\n\n# Company & context\n- company_size (string or range)\n- industry (string)\n- funding_stage (string)\n- mission (string)\n- diversity_statement (string)\n- glassdoor_rating (number if explicit)\n- departments (array)\n- locations (array of strings)\n- tags (array)\n\n# Auto-apply support\n- required_documents (array: resume, cover_letter, portfolio, references, transcripts, code_samples, github, linkedin)\n- screening_questions (array)\n- auto_reject_criteria (array)\n- application_portal_type (e.g. 'LinkedIn', 'Greenhouse', 'Proprietary')\n\nReturn ONLY strict JSON: {"title":..., "company":..., "location":..., "description":..., "metadata":{...}}.\nIf a field unknown, omit it or set null (avoid placeholders). Use arrays for lists. Do not include commentary.\n\nHTML:\n----------------\n${truncatedHtml}\n----------------`;
}

// Link discovery (LLM) prompts
export const LINK_DISCOVERY_SYSTEM = `You are an assistant that filters and prioritizes hyperlinks likely to lead directly to individual job postings or to focused job listing pages containing openings. Output only JSON with an array 'urls'.`;

export function buildLinkDiscoveryUserPrompt(data: { base: string; links: { url: string; anchor: string; context?: string }[] }) {
  const guidance = `CRITERIA:
INCLUDE if likely a job posting OR a listing page leading to postings soon (e.g. /careers/, /jobs/, /positions/, greenhouse.io, lever.co, /job/, /opportunity/, /opportunities/, /join-?, /work-with-us/ etc.).
Favor links whose slugs contain role-like tokens (engineer, developer, designer, product, marketing, sales, data, backend, frontend, fullstack) OR unique IDs / numeric tokens / hyphenated role phrases.
EXCLUDE generic top-level pages (about, blog, press, news, team unless /careers), social links, signup/login, contact, faq, privacy, terms, sitemap.
Return at most 20 high quality unique absolute URLs from the provided set. Do NOT invent URLs.
If a direct posting (single role) appears, include it even if the anchor text is short.
Return STRICT JSON: {"urls":["..."]}`;
  return `${guidance}\n\nBASE: ${data.base}\nCANDIDATES_JSON = ${JSON.stringify(data.links, null, 2)}`;
}
