"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { uploadTenantLogoFile } from "@/lib/upload-logo";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimezoneSelect } from "@/components/timezone-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserTimezone } from "@/lib/timezones";

export default function OnboardingProfilePage() {
  const { tenant, refreshMe } = useAuth();
  const router = useRouter();
  const [storeName, setStoreName] = useState(tenant?.storeName ?? "");
  const [timezone, setTimezone] = useState(tenant?.timezone ?? getBrowserTimezone());
  const [websiteUrl, setWebsiteUrl] = useState(tenant?.websiteUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(tenant?.logoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const continueNext = async () => {
    if (!storeName.trim()) {
      toast.error("Store name is required");
      return;
    }
    const trimmedUrl = websiteUrl.trim();
    if (trimmedUrl && !trimmedUrl.startsWith("http")) {
      toast.error("Website must start with http:// or https:// — or leave it blank");
      return;
    }
    setLoading(true);
    try {
      await api.tenant.updateMe({
        storeName,
        timezone,
        websiteUrl: trimmedUrl || undefined,
      });
      await api.onboarding.advanceStep("channels");
      await refreshMe();
      toast.success("Profile saved");
      router.push("/onboarding/channels");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingShell currentStep="profile">
      <Card>
        <CardHeader>
          <CardTitle>Store profile</CardTitle>
          <CardDescription>Tell us about your store — we use this in the bot and onboarding steps</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Store name</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Store website (optional)</Label>
            <Input
              id="website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourstore.com"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if you only sell on WooCommerce, WhatsApp, or marketplaces — you can connect
              WordPress in the next steps or add a site later.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneSelect id="timezone" value={timezone} onChange={setTimezone} />
          </div>
          <div className="space-y-2">
            <Label>Store logo (optional)</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingLogo(true);
                try {
                  const res = await uploadTenantLogoFile(file);
                  setLogoUrl(res.data.logoUrl);
                  await refreshMe();
                  toast.success("Logo uploaded");
                } catch (err) {
                  const msg =
                    err && typeof err === "object" && "message" in err
                      ? String((err as { message: string }).message)
                      : err instanceof Error
                        ? err.message
                        : "Logo upload failed";
                  toast.error(msg);
                } finally {
                  setUploadingLogo(false);
                }
              }}
            />
            <div className="flex items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Store logo" className="h-12 w-12 rounded border object-cover" />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
              </Button>
            </div>
          </div>
          <Button onClick={continueNext} disabled={loading || !storeName.trim()}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
