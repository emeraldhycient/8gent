// Use ChatOllama (chat interface) instead of Ollama because tool/function binding
// is only implemented on chat models. The previous Ollama class lacks `bindTools`.
// Removed unused Ollama & Google Gemini imports after switching to OpenAI + sqlite async
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
    END,
    MemorySaver,
    MessagesAnnotation,
    START,
    StateGraph,
} from "@langchain/langgraph";
import { TavilySearch } from "@langchain/tavily"
import { AIMessage, BaseMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { upsertLink } from "../../../lib/db";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ChatOpenAI } from "@langchain/openai";



// const ollama = new Ollama({
//     model: "codeqwen", // Ensure this model supports tool calling in your local Ollama build.
//     baseUrl: "http://localhost:11434",
//     // temperature: 0.2, // (optional) tweak as needed
// });

// const LLm = new ChatGoogleGenerativeAI({
//     model: "gemini-1.5-pro",
//     // maxOutputTokens: 2048,
//     apiKey: process.env.GOOGLE_API_KEY,
// });


const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
});

// System prompt instructing the model how to behave.
const SYSTEM_PROMPT = `You are an autonomous job-sourcing agent.
Goal: Use the Tavily web search tool repeatedly to discover CURRENT individual job openings.
Instructions:
1. Devise focused queries (company careers + role keywords, specific stacks, remote modifiers, etc.).
2. After each search, mentally parse results and collect unique job posting URLs (ignore generic career landing pages unless they clearly point to a single role page).
3. Continue issuing varied, targeted searches until you stop finding NEW unique openings (avoid duplicates by URL or very similar titles).
4. When you believe you have exhausted obvious queries (or after ~6 productive searches), produce a FINAL CLEAN LIST.
5. The final list MUST be concise JSON-like bullet lines: Title - URL (no extra commentary).
6. After producing the final list, invoke the logging tool ONCE to record it.
Return ONLY the clean list before calling the logging tool. Avoid extra commentary.`;

const webSearchTool = new TavilySearch();

// Custom tool to log final results; model should call this after producing list.
const logResultTool = new DynamicStructuredTool({
    name: "log_final_job_results",
    description: "Log the final compiled list of job openings (title and url). Call ONLY once after you finish searching.",
    schema: z.object({
        results: z.array(
            z.object({
                title: z.string().describe("Job title / role name"),
                url: z.string().describe("Direct URL to the job posting (absolute HTTP/HTTPS)")
            })
        ).min(1).describe("Final deduplicated list of job openings")
    }),
    func: async ({ results }) => {
        console.log("[Job Aggregator] Final Job Openings (count=" + results.length + "):\n", results);
        let inserted = 0;
        for (const r of results) {
            try {
                if (r.url) {
                    await upsertLink(r.url, "agent_seed", 0);
                    inserted++;
                }
            } catch (e) {
                console.error("[Job Aggregator] Error logging job opening:", e);
            }
        }
        return `Logged ${results.length} job openings. Seeded ${inserted} urls into crawl queue.`;
    }
});

const tools = [webSearchTool, logResultTool];

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
    if (
        lastMessage._getType() !== "ai" ||
        !(lastMessage as AIMessage).tool_calls?.length
    ) {
        // LLM did not call any tools, or it's not an AI message, so we should end.
        return END;
    }
    return "tools";
};

const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addEdge(START, "agent")
    .addNode("tools", toolNode)
    .addEdge("tools", "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END]);

// Helper to run the agent with a supplied system prompt and user input.
// Usage: await runAgent({ system: "You are a helpful assistant.", user: "What's the weather?" });
export async function runAgent(threadId?: string) {
    const app = workflow.compile({ checkpointer: new MemorySaver() });
    const initialMessages: BaseMessage[] = [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage("Begin autonomous job sourcing now. Perform searches and compile final list when ready.")
    ];
    const id = threadId || randomUUID();
    const result = await app.invoke(
        { messages: initialMessages },
        { configurable: { thread_id: id } }
    );
    return result.messages; // Array including tool calls & final AI answer
}

// If you need streaming, you can instead use: for await (const step of app.stream({ messages: initialMessages })) { ... }
