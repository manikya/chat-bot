"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  mapSignupApiError,
  validateSignupForm,
  type SignupField,
  type SignupFieldErrors,
} from "@/lib/auth/signup-validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FIELDS: SignupField[] = ["storeName", "name", "email", "password"];

const FIELD_LABELS: Record<SignupField, string> = {
  storeName: "Store name",
  name: "Your name",
  email: "Email",
  password: "Password",
};

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    name: "",
    email: "",
    password: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const clearFieldError = (field: SignupField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const updateField = (field: SignupField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const clientErrors = validateSignupForm(form);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const res = await api.auth.signup(form);
      const verified = Boolean((res.data as { emailVerified?: boolean } | undefined)?.emailVerified);
      if (verified) {
        toast.success("Account created! You can sign in now.");
        router.push("/login");
      } else {
        toast.success("Account created! Check your email.");
        router.push(`/verify-email-pending?email=${encodeURIComponent(form.email)}`);
      }
    } catch (err) {
      const { fieldErrors: apiFieldErrors, formError: apiFormError } = mapSignupApiError(err);
      setFieldErrors(apiFieldErrors);
      setFormError(apiFormError ?? null);
      if (apiFormError) toast.error(apiFormError);
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
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {formError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            {FIELDS.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{FIELD_LABELS[field]}</Label>
                <Input
                  id={field}
                  type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                  value={form[field]}
                  onChange={(e) => updateField(field, e.target.value)}
                  aria-invalid={Boolean(fieldErrors[field])}
                  aria-describedby={fieldErrors[field] ? `${field}-error` : undefined}
                  className={cn(fieldErrors[field] && "border-destructive focus-visible:ring-destructive")}
                />
                {field === "password" && !fieldErrors.password && (
                  <p className="text-xs text-muted-foreground">
                    At least 10 characters with uppercase, lowercase, and a number.
                  </p>
                )}
                {fieldErrors[field] && (
                  <p id={`${field}-error`} className="text-xs text-destructive" role="alert">
                    {fieldErrors[field]}
                  </p>
                )}
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
