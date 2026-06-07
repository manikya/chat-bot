"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function WidgetPage() {
  const [embed, setEmbed] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.widget.getConfig().then((r) => {
      setEmbed(r.data.embedCode ?? "");
      setColor(r.data.primaryColor);
    });
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(embed);
    setCopied(true);
    toast.success("Embed code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Web widget</h1>
        <p className="text-muted-foreground">Embed the chat widget on your storefront</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Embed code</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap">{embed}</pre>
            <Button onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy to clipboard
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Primary color</Label>
              <div className="flex gap-2">
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 h-9 p-1" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: color }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-medium text-sm">Acme Shoes</span>
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm">Hi! How can I help you shop today?</div>
            </div>
            <Button variant="outline" onClick={async () => {
              const cfg = await api.tenant.getConfig();
              await api.tenant.updateConfig({
                widgetConfig: {
                  primaryColor: color,
                  position: cfg.data?.widgetConfig?.position ?? "bottom-right",
                  suggestedQuestions: cfg.data?.widgetConfig?.suggestedQuestions ?? [],
                },
              });
              toast.success("Widget style saved (real config API)");
            }}>Save appearance</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
