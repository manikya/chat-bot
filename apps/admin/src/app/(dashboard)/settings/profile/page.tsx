"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Image, Save, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api";
import { uploadTenantLogoFile } from "@/lib/upload-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TimezoneSelect } from "@/components/timezone-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconFrame, PageIntro, SectionHeader } from "@/components/layout/admin-page";

export default function ProfileSettingsPage() {
  const { user, tenant, refreshMe } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(tenant?.logoUrl);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.tenant.getMe().then((r) => {
      setStoreName(r.data?.storeName ?? "");
      setTimezone(r.data?.timezone ?? "");
      setLogoUrl(r.data?.logoUrl);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.tenant.updateMe({ storeName, timezone });
      await refreshMe();
      toast.success("Store profile saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const res = await uploadTenantLogoFile(file);
      setLogoUrl(res.data.logoUrl);
      await refreshMe();
      toast.success("Logo uploaded");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Logo upload failed";
      toast.error(msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Account settings"
        title="Keep store identity and operator access details aligned."
        description="Profile fields identify the signed-in user, while store settings control tenant-facing labels and local timezone behavior."
        action={<Badge variant="secondary">{user?.role ?? "loading"}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Operator"
            title="Profile"
            description="Read-only account identity from authentication."
          />
          <IconFrame className="border-slate-200 bg-slate-100 text-slate-700">
            <UserRound className="h-4 w-4" />
          </IconFrame>
        </CardHeader>
        <CardContent className="max-w-md space-y-4">
          <div className="space-y-2"><Label>Name</Label><Input value={user?.name ?? ""} readOnly /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={user?.email ?? ""} readOnly /></div>
          <div className="space-y-2"><Label>Role</Label><Input value={user?.role ?? ""} readOnly /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Tenant"
            title="Store"
            description="Controls labels and dates shown across the admin workflow."
          />
          <IconFrame>
            <Building2 className="h-4 w-4" />
          </IconFrame>
        </CardHeader>
        <CardContent className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label>Store name</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneSelect id="timezone" value={timezone} onChange={setTimezone} />
          </div>
          <div className="space-y-2">
            <Label>Store logo</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void uploadLogo(file);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3 rounded-lg border bg-muted p-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Store logo" className="h-14 w-14 rounded-lg border bg-white object-cover" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-lg border bg-white text-muted-foreground">
                  <Image className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{logoUrl ? "Logo uploaded" : "No logo uploaded"}</p>
                <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP. Used for store branding.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploadingLogo ? "Uploading..." : logoUrl ? "Change logo" : "Upload logo"}
              </Button>
            </div>
          </div>
          <div className="space-y-2"><Label>Plan</Label><Input value={user?.email ? "trial" : ""} readOnly /></div>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save store profile"}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
