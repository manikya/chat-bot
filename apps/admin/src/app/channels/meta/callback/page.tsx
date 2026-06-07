"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  clearMetaOAuthReturn,
  consumeMetaOAuthState,
  getMetaOAuthRedirectUri,
} from "@/lib/meta-oauth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function MetaOAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Connecting WhatsApp…");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setMessage(`Meta authorization failed: ${error}`);
      toast.error("WhatsApp connection cancelled");
      return;
    }

    if (!code) {
      setMessage("Missing authorization code from Meta.");
      return;
    }

    const returnPath = consumeMetaOAuthState(state);
    if (!returnPath) {
      setMessage("Invalid OAuth state. Please try connecting again.");
      toast.error("Session expired — try Connect WhatsApp again");
      return;
    }

    (async () => {
      try {
        await api.channels.connectMeta({
          code,
          redirectUri: getMetaOAuthRedirectUri(),
        });
        clearMetaOAuthReturn();
        toast.success("WhatsApp connected");
        router.replace(returnPath);
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Connection failed";
        setMessage(msg);
        toast.error(msg);
      }
    })();
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">WhatsApp connection</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {message}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MetaOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <MetaOAuthCallbackInner />
    </Suspense>
  );
}
