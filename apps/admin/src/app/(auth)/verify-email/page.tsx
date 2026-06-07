"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Verification link is missing or invalid.");
      setLoading(false);
      return;
    }

    api.auth
      .verifyEmail(token)
      .then(() => {
        setDone(true);
        setLoading(false);
      })
      .catch((err: { message?: string }) => {
        setError(err.message ?? "Verification failed");
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />}
          {error && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button asChild variant="outline"><Link href="/login">Back to login</Link></Button>
            </>
          )}
          {done && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <p>Your email is verified!</p>
              <Button asChild><Link href="/login">Continue to login</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
