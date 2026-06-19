export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; response: ChatResponse };

export interface LLMProvider {
  readonly name: "openai" | "mock";
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat?(
    request: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void | Promise<void>
  ): Promise<ChatResponse>;
  supportsTools(): boolean;
}
