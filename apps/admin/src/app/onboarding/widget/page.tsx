"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { apiPublicBaseUrl } from "@/lib/onboarding-env";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const INSTALL_GUIDES = [
  {
    platform: "Any HTML site",
    steps: ["Copy the embed snippet below", "Paste before </body> on every page", "Publish and open your storefront"],
  },
  {
    platform: "WordPress / WooCommerce",
    steps: [
      "Appearance → Theme File Editor → footer.php (or use a header/footer plugin)",
      "Paste the snippet before </body>",
      "Or use CommerceChat Connector — widget works alongside the plugin",
    ],
  },
  {
    platform: "Shopify",
    steps: ["Online Store → Themes → Edit code", "Open theme.liquid", "Paste snippet before </body>", "Save"],
  },
];

export default function OnboardingWidgetPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [embed, setEmbed] = useState("");
  const [copied, setCopied] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(INSTALL_GUIDES[0].platform);
  const apiBase = apiPublicBaseUrl();
  const demoUrl = `${apiBase}/widget/demo.html`;

  useEffect(() => {
    api.widget.getConfig().then((r) => setEmbed(r.data.embedCode ?? ""));
  }, []);

  const finish = async () => {
    await api.onboarding.advanceStep("complete");
    await refreshMe();
    toast.success("Setup complete!");
    router.push("/dashboard");
  };

  const emailSnippet = () => {
    const subject = encodeURIComponent("CommerceChat widget embed code");
    const body = encodeURIComponent(`Add this before </body> on the store:\n\n${embed}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <OnboardingShell currentStep="widget">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Add widget to your store</CardTitle>
            <CardDescription>
              Copy this snippet before your closing &lt;/body&gt; tag. API: <code className="text-xs">{apiBase}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap">{embed}</pre>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(embed);
                  setCopied(true);
                  toast.success("Copied");
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy embed code
              </Button>
              <Button variant="outline" onClick={emailSnippet}>
                <Mail className="h-4 w-4" /> Email to developer
              </Button>
              <Button variant="outline" asChild>
                <a href={demoUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Open widget demo
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Install instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {INSTALL_GUIDES.map((g) => (
              <div key={g.platform} className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  onClick={() => setOpenGuide(openGuide === g.platform ? null : g.platform)}
                >
                  {g.platform}
                  <span className="text-muted-foreground text-xs">{openGuide === g.platform ? "−" : "+"}</span>
                </button>
                {openGuide === g.platform && (
                  <ol className="list-decimal px-8 pb-4 text-sm text-muted-foreground space-y-1">
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={finish}>Go to dashboard</Button>
      </div>
    </OnboardingShell>
  );
}
