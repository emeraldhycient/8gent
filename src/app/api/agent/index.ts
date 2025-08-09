
import { ChatOpenAI } from "@langchain/openai";
import { runAgent } from "../../../lib/agent/utils";
import { SEARCH_AGENT_SYSTEM_PROMPT } from "../../../lib/prompts";
import { createWebSearchTool, createLogResultTool } from "../../../lib/tools";

const llm = new ChatOpenAI({ model: 'gpt-4o' });

export async function runSearchAgent(threadId?: string) {
    const tools = [createWebSearchTool(), createLogResultTool()];
    return await runAgent({
        systemPrompt: SEARCH_AGENT_SYSTEM_PROMPT,
        userPrompt: 'Begin autonomous job sourcing now. Perform searches and compile final list when ready.',
        tools,
        threadId,
        llm,
    });
}

// Backwards compatibility export (route.ts imports runAgent previously)
export { runSearchAgent as runAgent };
