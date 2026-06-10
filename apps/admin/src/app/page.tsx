"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { isAuthenticated, isLoading, tenant, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (
      user?.role === "owner" &&
      tenant?.onboardingStep &&
      tenant.onboardingStep !== "complete"
    ) {
      router.replace(`/onboarding/${tenant.onboardingStep}`);
      return;
    }
    router.replace("/dashboard");
  }, [isLoading, isAuthenticated, tenant, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
