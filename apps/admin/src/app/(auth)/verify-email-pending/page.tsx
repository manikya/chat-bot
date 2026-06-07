"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

function VerifyEmailPendingContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link. In local dev, check the API terminal for the verify URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-left">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@store.com"
          />
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={!email}
          onClick={async () => {
            await api.auth.resendVerification(email);
            toast.success("If unverified, a new link was sent (check API logs)");
          }}
        >
          Resend verification
        </Button>
        <Link href="/login" className="block text-sm text-primary hover:underline">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={<div>Loading...</div>}>
        <VerifyEmailPendingContent />
      </Suspense>
    </div>
  );
}
