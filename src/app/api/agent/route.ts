import { runAgent } from "./index"; // still exported for backward compatibility
import { AIMessage } from "@langchain/core/messages";
import { randomUUID } from "crypto";

export async function GET() {
  try {
  const threadId = randomUUID();
  const messages = await runAgent(threadId);
    // Find the last AI message (final answer) if present
    const lastAI = [...messages].reverse().find(m => m._getType && m._getType() === "ai") as AIMessage | undefined;
    const response = {
      final_text: lastAI ? lastAI.content : null,
      message_count: messages.length,
      thread_id: threadId,
    };
      return new Response(JSON.stringify({ response, messages }), { headers: { "Content-Type": "application/json" } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
