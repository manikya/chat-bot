"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  clearMetaOAuthReturn,
  consumeMetaOAuthFlow,
  consumeMetaOAuthState,
  getMetaOAuthRedirectUri,
} from "@/lib/meta-oauth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageOption = {
  id: string;
  name: string;
  pageAccessToken: string;
  igUserId?: string;
  igUsername?: string;
};

function MetaOAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Connecting channel…");
  const [pageOptions, setPageOptions] = useState<PageOption[] | null>(null);
  const [completingPageId, setCompletingPageId] = useState<string | null>(null);
  const [oauthFlow, setOauthFlow] = useState<"whatsapp" | "messenger" | "instagram">("whatsapp");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setMessage(`Meta authorization failed: ${error}`);
      toast.error("Meta connection cancelled");
      return;
    }

    if (!code) {
      setMessage("Missing authorization code from Meta.");
      return;
    }

    const returnPath = consumeMetaOAuthState(state);
    if (!returnPath) {
      setMessage("Invalid OAuth state. Please try connecting again.");
      toast.error("Session expired — try Connect again");
      return;
    }

    const flow = consumeMetaOAuthFlow();
    setOauthFlow(flow);
    const redirectUri = getMetaOAuthRedirectUri();

    (async () => {
      try {
        if (flow === "messenger") {
          const res = await api.channels.connectMessenger({ code, redirectUri });
          const data = res.data as {
            needsPageSelection?: boolean;
            pages?: PageOption[];
            messenger?: { pageName?: string };
          };

          if (data?.needsPageSelection && data.pages?.length) {
            setPageOptions(data.pages);
            setMessage("Select the Facebook Page to connect:");
            return;
          }

          clearMetaOAuthReturn();
          toast.success(`Messenger connected${data?.messenger?.pageName ? `: ${data.messenger.pageName}` : ""}`);
          router.replace(returnPath);
          return;
        }

        if (flow === "instagram") {
          const res = await api.channels.connectInstagram({ code, redirectUri });
          const data = res.data as {
            needsPageSelection?: boolean;
            pages?: PageOption[];
            instagram?: { igUsername?: string; pageName?: string };
          };

          if (data?.needsPageSelection && data.pages?.length) {
            setPageOptions(data.pages);
            setMessage("Select the Page with a linked Instagram account:");
            return;
          }

          clearMetaOAuthReturn();
          const label = data?.instagram?.igUsername
            ? `@${data.instagram.igUsername}`
            : data?.instagram?.pageName;
          toast.success(`Instagram connected${label ? `: ${label}` : ""}`);
          router.replace(returnPath);
          return;
        }

        await api.channels.connectMeta({ code, redirectUri });
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

  async function completePageSelection(page: PageOption) {
    setCompletingPageId(page.id);
    try {
      const flow = oauthFlow;
      if (flow === "instagram") {
        const res = await api.channels.connectInstagram({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.pageAccessToken,
          igUserId: page.igUserId,
          igUsername: page.igUsername,
        });
        const data = res.data as { instagram?: { igUsername?: string; pageName?: string } };
        clearMetaOAuthReturn();
        const label = data?.instagram?.igUsername
          ? `@${data.instagram.igUsername}`
          : data?.instagram?.pageName ?? page.name;
        toast.success(`Instagram connected: ${label}`);
        router.replace("/channels");
        return;
      }

      const res = await api.channels.connectMessenger({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.pageAccessToken,
      });
      const data = res.data as { messenger?: { pageName?: string } };
      clearMetaOAuthReturn();
      toast.success(`Messenger connected: ${data?.messenger?.pageName ?? page.name}`);
      router.replace("/channels");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Connection failed";
      toast.error(msg);
    } finally {
      setCompletingPageId(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Meta channel connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageOptions ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{message}</p>
              {pageOptions.map((page) => (
                <Button
                  key={page.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={completingPageId !== null}
                  onClick={() => completePageSelection(page)}
                >
                  {completingPageId === page.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {page.name}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {message}
            </div>
          )}
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
