"use client";

import { useEffect, useState } from "react";
import type { PlatformUser } from "@commercechat/mock-api";
import { AlertTriangle, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { PageIntro, SectionHeader } from "@/components/layout/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLES = ["owner", "admin", "support"] as const;
const STATUSES = ["active", "disabled"] as const;

function dateLabel(value: string | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("support");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.platform.listUsers();
      setUsers(res.data.items);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "Could not load platform users";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.platform.createUser({ email, name, password, role });
      setUsers((current) => [res.data, ...current.filter((user) => user.email !== res.data.email)]);
      setEmail("");
      setName("");
      setPassword("");
      setRole("support");
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "Could not create platform user";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateUser = async (user: PlatformUser, patch: { role?: string; status?: string }) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.platform.updateUser(user.email, patch);
      setUsers((current) => current.map((item) => (item.email === user.email ? res.data : item)));
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "Could not update platform user";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Platform"
        title="Platform users"
        description="Manage the separate operations accounts used by CommerceChat platform admins."
        action={
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <SectionHeader
              eyebrow="Directory"
              title="Operations users"
              description="These accounts are separate from merchant tenant team members."
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Loading users...</TableCell>
                  </TableRow>
                ) : users.length ? (
                  users.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell>
                        <div className="font-semibold">{user.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>
                        <Select value={user.role} disabled={isSaving} onValueChange={(value) => void updateUser(user, { role: value })}>
                          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={user.status} disabled={isSaving} onValueChange={(value) => void updateUser(user, { status: value })}>
                          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === "active" ? "success" : "warning"}>{dateLabel(user.lastLoginAt)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No platform users yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader eyebrow="Create" title="Add platform user" />
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="platform-user-name">Name</Label>
                <Input id="platform-user-name" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-user-email">Email</Label>
                <Input id="platform-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-user-password">Temporary password</Label>
                <Input id="platform-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create user
              </Button>
              <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Platform owners can create and disable users. Bootstrap access still comes from `PLATFORM_ADMIN_EMAILS`.
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
