"use client";

import { useEffect, useState } from "react";
import { Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { TeamMember } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconFrame, MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";

function errorMessage(err: unknown, fallback: string) {
  return err && typeof err === "object" && "message" in err
    ? String(err.message)
    : err instanceof Error
      ? err.message
      : fallback;
}

export default function TeamPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const canInvite = isOwner || user?.role === "admin";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: "", name: "", role: "viewer" });

  const load = () => api.team.list().then((r) => setMembers(r.data.items));
  useEffect(() => { load(); }, []);

  const sendInvite = async () => {
    try {
      await api.team.invite(invite);
      toast.success(`Invite sent to ${invite.email}`);
      setShowInvite(false);
      setInvite({ email: "", name: "", role: "viewer" });
    } catch (err) {
      toast.error(errorMessage(err, "Invite failed"));
    }
  };

  const changeRole = async (member: TeamMember, role: string) => {
    if (member.role === role) return;
    try {
      await api.team.updateRole(member.userId, role);
      toast.success(`Updated ${member.name} to ${role}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update role"));
      load();
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    try {
      await api.team.remove(member.userId);
      toast.success(`Removed ${member.name}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove member"));
    }
  };

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Access control"
        title="Manage teammates, roles, and invitation state."
        description="Owners can change roles and remove members; admins can invite teammates into the store workspace."
        action={canInvite && <Button onClick={() => setShowInvite(true)}><UserPlus className="h-4 w-4" /> Invite teammate</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Members" value={members.length} detail="total seats" icon={<Users className="h-4 w-4" />} />
        <MetricTile label="Admins" value={members.filter((member) => member.role === "admin").length} detail="can manage setup" icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricTile label="Pending" value={members.filter((member) => member.status !== "active").length} detail="invite status" icon={<Mail className="h-4 w-4" />} />
        <MetricTile label="Your role" value={user?.role ?? "viewer"} detail={isOwner ? "full control" : "limited access"} icon={<UserPlus className="h-4 w-4" />} />
      </div>

      {showInvite && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <SectionHeader
              eyebrow="Invitation"
              title="Invite team member"
              description="Send a secure invitation with the role selected below."
            />
            <IconFrame>
              <UserPlus className="h-4 w-4" />
            </IconFrame>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Email</Label><Input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Name</Label><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={invite.role} onValueChange={(role) => setInvite({ ...invite, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={sendInvite}>Send invite</Button>
              <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Directory"
            title="Team members"
            description="Review active users, pending invites, and role assignment."
          />
          <Badge variant={isOwner ? "success" : "secondary"}>{isOwner ? "owner controls" : "view access"}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {isOwner && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <IconFrame className="border-slate-200 bg-slate-100 text-slate-700">
                        <Users className="h-4 w-4" />
                      </IconFrame>
                      <span className="font-medium">{m.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    {isOwner && m.role !== "owner" ? (
                      <Select value={m.role} onValueChange={(role) => changeRole(m, role)}>
                        <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="viewer">viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant={m.status === "active" ? "success" : "secondary"}>{m.status}</Badge></TableCell>
                  {isOwner && (
                    <TableCell>
                      {m.role !== "owner" && m.userId !== user?.userId && (
                        <Button variant="ghost" size="icon" onClick={() => removeMember(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
