import {
  createEmailProvider,
  loadConfig,
  type AuthDeps,
} from "@commercechat/core";

let authDeps: AuthDeps | null = null;

export function getAuthDeps(): AuthDeps {
  if (!authDeps) {
    const config = loadConfig();
    authDeps = {
      config,
      email: createEmailProvider(config),
    };
  }
  return authDeps;
}
