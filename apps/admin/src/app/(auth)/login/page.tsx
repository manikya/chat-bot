"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      router.push("/");
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Please verify your email first");
        router.push(`/verify-email-pending?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error(error.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
            <MessageCircle className="h-6 w-6" />
          </div>
          <CardTitle>CommerceChat</CardTitle>
          <CardDescription>Sign in to your merchant dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex justify-between text-sm">
              <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account? <Link href="/signup" className="text-primary hover:underline">Start free trial</Link>
            </p>
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Uses <strong>real Lambda APIs</strong> (auth + tenant). With{" "}
              <code className="text-[11px]">SKIP_EMAIL_VERIFICATION=true</code> in{" "}
              <code className="text-[11px]">apps/api/.env</code>, sign up and log in without email verification.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
