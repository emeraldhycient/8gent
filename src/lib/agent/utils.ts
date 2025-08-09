import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { randomUUID } from "crypto";

// Lightweight LLM factory (can be expanded later if we add model routing)
export function createLLM(model = "gpt-4o", temperature = 0) {
	return new ChatOpenAI({ model, temperature });
}

// Build a standard agent workflow given a set of tools.
export function createAgentWorkflow(tools: any[]) {
	const toolNode = new ToolNode(tools);

	const callModel = async (state: typeof MessagesAnnotation.State, llm: ChatOpenAI) => {
		const { messages } = state;
		const llmWithTools = llm.bindTools(tools);
		const result = await llmWithTools.invoke(messages);
		return { messages: [result] };
	};

	const shouldContinue = (state: typeof MessagesAnnotation.State) => {
		const { messages } = state;
		const last = messages[messages.length - 1];
		if (last._getType() !== 'ai' || !(last as AIMessage).tool_calls?.length) return END;
		return 'tools';
	};

	const graph = new StateGraph(MessagesAnnotation)
		.addNode('agent', async (s) => callModel(s, (globalThis as any).__ACTIVE_LLM__))
		.addEdge(START, 'agent')
		.addNode('tools', toolNode)
		.addEdge('tools', 'agent')
		.addConditionalEdges('agent', shouldContinue, ['tools', END]);

	return graph;
}

// Run an agent given system + initial user text and tools.
export async function runAgent({
	systemPrompt,
	userPrompt,
	tools,
	threadId,
	llm,
}: {
	systemPrompt: string;
	userPrompt: string;
	tools: any[];
	threadId?: string;
	llm?: ChatOpenAI;
}) {
	const model = llm || createLLM();
	// Expose model for node callback binding (simple approach without restructuring signature)
	(globalThis as any).__ACTIVE_LLM__ = model;
	const workflow = createAgentWorkflow(tools);
	const app = workflow.compile({ checkpointer: new MemorySaver() });
	const initialMessages: BaseMessage[] = [
		new SystemMessage(systemPrompt),
		new HumanMessage(userPrompt)
	];
	const id = threadId || randomUUID();
	const result = await app.invoke({ messages: initialMessages }, { configurable: { thread_id: id } });
	return result.messages;
}
