import {
  ConsoleEmailProvider,
  loadConfig,
  type AuthDeps,
} from "@commercechat/core";

let authDeps: AuthDeps | null = null;

export function getAuthDeps(): AuthDeps {
  if (!authDeps) {
    authDeps = {
      config: loadConfig(),
      email: new ConsoleEmailProvider(),
    };
  }
  return authDeps;
}
