"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingProfilePage() {
  const { tenant, refreshMe } = useAuth();
  const router = useRouter();
  const [storeName, setStoreName] = useState(tenant?.storeName ?? "");
  const [timezone, setTimezone] = useState(tenant?.timezone ?? "America/New_York");
  const [loading, setLoading] = useState(false);

  const continueNext = async () => {
    setLoading(true);
    await api.tenant.updateMe({ storeName, timezone, onboardingStep: "channels" });
    try {
      await api.onboarding.advanceStep("channels");
    } catch {
      /* onboarding Lambda not built — tenant profile step still saved */
    }
    await refreshMe();
    toast.success("Profile saved (real tenant API)");
    router.push("/onboarding/channels");
    setLoading(false);
  };

  return (
    <OnboardingShell currentStep="profile">
      <Card>
        <CardHeader>
          <CardTitle>Store profile</CardTitle>
          <CardDescription>Tell us about your store</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Store name</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Timezone</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
          <Button onClick={continueNext} disabled={loading || !storeName}>Continue</Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
