import type { ChatRequest, ChatResponse, LLMProvider } from "./types";

const MAX_RETRIES = 2;

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai" as const;

  constructor(
    private apiKey: string,
    private defaultModel: string
  ) {}

  supportsTools() {
    return true;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })) } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: request.temperature ?? 0.4,
      max_tokens: request.maxOutputTokens ?? 800,
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`OpenAI chat failed (${res.status}): ${text}`);
        }
        const json = (await res.json()) as {
          choices: Array<{
            message: {
              content: string | null;
              tool_calls?: Array<{
                id: string;
                function: { name: string; arguments: string };
              }>;
            };
            finish_reason: string;
          }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
          model: string;
        };
        const choice = json.choices[0]!;
        const toolCalls = choice.message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }));

        return {
          content: choice.message.content ?? "",
          toolCalls,
          usage: {
            inputTokens: json.usage?.prompt_tokens ?? 0,
            outputTokens: json.usage?.completion_tokens ?? 0,
          },
          finishReason: choice.finish_reason,
          provider: "openai",
          model: json.model,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
    }
    throw lastError ?? new Error("OpenAI chat failed");
  }
}
