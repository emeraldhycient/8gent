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
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { runAgent } from "../../../lib/agent/utils";
import { SEARCH_AGENT_SYSTEM_PROMPT } from "../../../lib/prompts";
import { createWebSearchTool, createLogResultTool } from "../../../lib/tools";



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


const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });

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
