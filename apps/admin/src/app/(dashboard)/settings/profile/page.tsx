"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimezoneSelect } from "@/components/timezone-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserTimezone } from "@/lib/timezones";

export default function ProfileSettingsPage() {
  const { user, refreshMe } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.tenant.getMe().then((r) => {
      setStoreName(r.data?.storeName ?? "");
      setTimezone(r.data?.timezone ?? "");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Your account and store details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2"><Label>Name</Label><Input value={user?.name ?? ""} readOnly /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={user?.email ?? ""} readOnly /></div>
          <div className="space-y-2"><Label>Role</Label><Input value={user?.role ?? ""} readOnly /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Store</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>Store name</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneSelect id="timezone" value={timezone} onChange={setTimezone} />
          </div>
          <div className="space-y-2"><Label>Plan</Label><Input value={user?.email ? "trial" : ""} readOnly /></div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save store profile"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
