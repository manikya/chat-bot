"use client";

import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingCatalogPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();

  const next = async () => {
    await api.onboarding.advanceStep("test");
    await refreshMe();
    router.push("/onboarding/test");
  };

  return (
    <OnboardingShell currentStep="catalog">
      <Card>
        <CardHeader>
          <CardTitle>Product catalog</CardTitle>
          <CardDescription>Upload a CSV of products (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Drag & drop products.csv or click to browse</p>
            <Button variant="outline" className="mt-4" disabled>Upload (mock)</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={next}>Continue</Button>
            <Button variant="outline" onClick={next}>Skip</Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
