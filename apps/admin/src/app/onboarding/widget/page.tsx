"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingWidgetPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [embed, setEmbed] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.widget.getConfig().then((r) => setEmbed(r.data.embedCode ?? ""));
  }, []);

  const finish = async () => {
    await api.onboarding.advanceStep("complete");
    await refreshMe();
    toast.success("Setup complete!");
    router.push("/dashboard");
  };

  return (
    <OnboardingShell currentStep="widget">
      <Card>
        <CardHeader>
          <CardTitle>Add widget to your store</CardTitle>
          <CardDescription>Copy this snippet before your closing &lt;/body&gt; tag</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap">{embed}</pre>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(embed); setCopied(true); toast.success("Copied"); }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy embed code
          </Button>
          <Button onClick={finish}>Go to dashboard</Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
