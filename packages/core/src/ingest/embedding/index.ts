import type { CoreConfig } from "../../config";
import { MockEmbeddingProvider } from "./mock";
import { OpenAIEmbeddingProvider } from "./openai";
import type { EmbeddingProvider } from "./provider";

export function createEmbeddingProvider(config: CoreConfig): EmbeddingProvider {
  if (config.openaiApiKey) {
    return new OpenAIEmbeddingProvider(config.openaiApiKey, config.embeddingModel);
  }
  return new MockEmbeddingProvider();
}

export type { EmbeddingProvider } from "./provider";
