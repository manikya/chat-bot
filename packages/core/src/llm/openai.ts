import type { ChatRequest, ChatResponse, ChatStreamEvent, LLMProvider, ToolCall } from "./types";

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

  private requestBody(request: ChatRequest, options?: { stream?: boolean }) {
    return {
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
      ...(options?.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const body = this.requestBody(request);

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

  async streamChat(
    request: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void | Promise<void>
  ): Promise<ChatResponse> {
    const start = Date.now();
    const body = this.requestBody(request, { stream: true });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`OpenAI stream failed (${res.status}): ${text}`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason = "stop";
    let model = request.model || this.defaultModel;
    let inputTokens = 0;
    let outputTokens = 0;
    const toolCalls = new Map<number, ToolCall>();

    const handlePayload = async (payload: string) => {
      if (!payload || payload === "[DONE]") return;
      const json = JSON.parse(payload) as {
        model?: string;
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (json.model) model = json.model;
      if (json.usage) {
        inputTokens = json.usage.prompt_tokens ?? inputTokens;
        outputTokens = json.usage.completion_tokens ?? outputTokens;
      }
      const choice = json.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const token = choice.delta?.content;
      if (token) {
        content += token;
        await onEvent({ type: "token", text: token });
      }

      for (const delta of choice.delta?.tool_calls ?? []) {
        const existing = toolCalls.get(delta.index) ?? {
          id: delta.id ?? `call_${delta.index}`,
          name: "",
          arguments: "",
        };
        if (delta.id) existing.id = delta.id;
        if (delta.function?.name) existing.name += delta.function.name;
        if (delta.function?.arguments) existing.arguments += delta.function.arguments;
        toolCalls.set(delta.index, existing);
      }
    };

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          await handlePayload(line.slice(5).trim());
        }
      }
    }
    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data:")) await handlePayload(line.slice(5).trim());
      }
    }

    const calls = [...toolCalls.values()].filter((tc) => tc.name);
    for (const toolCall of calls) {
      await onEvent({ type: "tool_call", toolCall });
    }

    const response: ChatResponse = {
      content,
      toolCalls: calls.length ? calls : undefined,
      usage: { inputTokens, outputTokens },
      finishReason,
      provider: "openai",
      model,
      latencyMs: Date.now() - start,
    };
    await onEvent({ type: "done", response });
    return response;
  }
}
