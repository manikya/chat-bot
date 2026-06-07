"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    name: "",
    email: "",
    password: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.auth.signup(form);
      toast.success("Account created! Check your email.");
      router.push(`/verify-email-pending?email=${encodeURIComponent(form.email)}`);
    } catch {
      toast.error("Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Start your free trial</CardTitle>
          <CardDescription>Create your CommerceChat store in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(["storeName", "name", "email", "password"] as const).map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{field === "storeName" ? "Store name" : field === "name" ? "Your name" : field.charAt(0).toUpperCase() + field.slice(1)}</Label>
                <Input
                  id={field}
                  type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  required
                />
              </div>
            ))}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
            <p className="text-center text-sm">
              Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
