import type { CoreConfig } from "../config";
import { OpenAILLMProvider } from "./openai";
import type { LLMProvider } from "./types";

export function createLLMProvider(config: CoreConfig): LLMProvider | null {
  if (config.openaiApiKey) {
    return new OpenAILLMProvider(config.openaiApiKey, config.llmModel);
  }
  return null;
}

export type { LLMProvider, ChatRequest, ChatResponse, ChatMessage, ToolDefinition, ToolCall } from "./types";
