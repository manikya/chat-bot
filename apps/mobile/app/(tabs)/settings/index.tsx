import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  BillingOverview,
  ChannelInfo,
  OnboardingState,
  TeamMember,
  TenantConfig,
  Usage,
} from "@commercechat/mock-api";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  PrimaryButton,
  Section,
  TextField,
} from "../../../src/components/admin/AdminScaffold";
import { useAuth } from "../../../src/lib/auth";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

export default function SettingsScreen() {
  const { tenant, user, logout, refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [storeName, setStoreName] = useState(tenant?.storeName ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(tenant?.websiteUrl ?? "");
  const [timezone, setTimezone] = useState(tenant?.timezone ?? "");
  const [greeting, setGreeting] = useState("");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [testMessage, setTestMessage] = useState("Do you have best sellers?");
  const [testReply, setTestReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === "owner" || user?.role === "admin";
  const canBill = user?.role === "owner";

  async function load() {
    setError(null);
    try {
      const [channelsRes, configRes, teamRes, onboardingRes, usageRes, billingRes] = await Promise.all([
        api.channels.list(),
        api.tenant.getConfig(),
        api.team.list(),
        api.onboarding.getState(),
        api.tenant.getUsage(),
        api.billing.getOverview(),
      ]);
      setChannels(channelsRes.data.channels);
      setConfig(configRes.data);
      setTeam(teamRes.data.items);
      setOnboarding(onboardingRes.data);
      setUsage(usageRes.data);
      setBilling(billingRes.data);
      setStoreName(tenant?.storeName ?? "");
      setWebsiteUrl(tenant?.websiteUrl ?? "");
      setTimezone(tenant?.timezone ?? "");
      setGreeting(configRes.data.prompts.greeting);
      setHandoffMessage(configRes.data.prompts.handoffMessage);
      setSystemPrompt(configRes.data.prompts.systemPrompt);
      setSuggestedQuestions(configRes.data.widgetConfig.suggestedQuestions.join("\n"));
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load settings");
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveStore() {
    setBusy("store");
    try {
      await api.tenant.updateMe({
        storeName: storeName.trim(),
        websiteUrl: websiteUrl.trim(),
        timezone: timezone.trim(),
      });
      await refreshMe();
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not save store profile");
      setBusy(null);
    }
  }

  async function saveBotWidget() {
    if (!config) return;
    setBusy("bot");
    try {
      await api.tenant.updateConfig({
        prompts: {
          ...config.prompts,
          greeting,
          handoffMessage,
          systemPrompt,
        },
        widgetConfig: {
          ...config.widgetConfig,
          suggestedQuestions: suggestedQuestions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not save bot settings");
      setBusy(null);
    }
  }

  function disconnectChannel(channel: string) {
    Alert.alert("Disconnect channel?", `Disconnect ${channel}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          setBusy(`channel-${channel}`);
          try {
            await api.channels.disconnect(channel);
            await load();
          } catch (e) {
            setError((e as { message?: string }).message ?? "Disconnect failed");
            setBusy(null);
          }
        },
      },
    ]);
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) return;
    setBusy("invite");
    try {
      await api.team.invite({ email: inviteEmail.trim(), name: inviteName.trim(), role: "viewer" });
      setInviteEmail("");
      setInviteName("");
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Invite failed");
      setBusy(null);
    }
  }

  async function updateRole(member: TeamMember) {
    const nextRole = member.role === "viewer" ? "admin" : "viewer";
    setBusy(member.userId);
    try {
      await api.team.updateRole(member.userId, nextRole);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Role update failed");
      setBusy(null);
    }
  }

  function removeMember(member: TeamMember) {
    Alert.alert("Remove team member?", `Remove ${member.email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(member.userId);
          try {
            await api.team.remove(member.userId);
            await load();
          } catch (e) {
            setError((e as { message?: string }).message ?? "Remove failed");
            setBusy(null);
          }
        },
      },
    ]);
  }

  async function runTestChat() {
    if (!testMessage.trim()) return;
    setBusy("test");
    try {
      const res = await api.onboarding.testChat(testMessage.trim());
      setTestReply(res.data.reply.content);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Test chat failed");
    } finally {
      setBusy(null);
    }
  }

  async function markStep(step: string) {
    setBusy(step);
    try {
      await api.onboarding.advanceStep(step);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not update onboarding");
      setBusy(null);
    }
  }

  return (
    <AdminScaffold
      title="Settings"
      subtitle={`${user?.role ?? "viewer"} · ${tenant?.plan ?? "plan"}`}
      loading={loading}
      error={error}
      actionLabel="Refresh"
      onAction={load}
    >
      <Section title="Store profile">
        <TextField label="Store name" value={storeName} onChangeText={setStoreName} />
        <TextField
          label="Website URL"
          value={websiteUrl}
          onChangeText={setWebsiteUrl}
          placeholder="https://example.com"
          keyboardType="url"
        />
        <TextField label="Timezone" value={timezone} onChangeText={setTimezone} />
        <PrimaryButton label="Save profile" onPress={saveStore} disabled={!canManage || busy === "store"} />
      </Section>

      <Section title="Channels">
        {channels.length ? (
          channels.map((channel) => (
            <View key={channel.channel} style={styles.channel}>
              <InfoRow
                label={channel.channel}
                value={channel.displayPhone ?? channel.pageName ?? channel.status}
                tone={channel.status === "connected" ? "good" : "warn"}
              />
              {channel.status === "connected" && canManage ? (
                <PrimaryButton
                  label={`Disconnect ${channel.channel}`}
                  onPress={() => disconnectChannel(channel.channel)}
                  disabled={busy === `channel-${channel.channel}`}
                  danger
                />
              ) : null}
            </View>
          ))
        ) : (
          <EmptyState message="No channels configured." />
        )}
      </Section>

      <Section title="Bot and widget">
        <TextField label="Greeting" value={greeting} onChangeText={setGreeting} multiline />
        <TextField label="Handoff message" value={handoffMessage} onChangeText={setHandoffMessage} />
        <TextField label="System prompt" value={systemPrompt} onChangeText={setSystemPrompt} multiline />
        <TextField
          label="Suggested questions"
          value={suggestedQuestions}
          onChangeText={setSuggestedQuestions}
          multiline
        />
        <InfoRow label="Widget color" value={config?.widgetConfig.primaryColor} />
        <InfoRow label="Widget position" value={config?.widgetConfig.position} />
        <PrimaryButton label="Save bot/widget" onPress={saveBotWidget} disabled={!canManage || busy === "bot"} />
      </Section>

      <Section title="Onboarding checklist">
        {onboarding ? (
          onboarding.steps.map((step) => (
            <View key={step.step} style={styles.stepRow}>
              <InfoRow
                label={step.step}
                value={step.status}
                tone={step.status === "completed" ? "good" : step.status === "in_progress" ? "warn" : "default"}
              />
              {step.status !== "completed" && canManage ? (
                <Pressable onPress={() => markStep(step.step)} disabled={busy === step.step}>
                  <Text style={styles.link}>Mark done</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <EmptyState message="Onboarding state is unavailable." />
        )}
        <TextField label="Test chat" value={testMessage} onChangeText={setTestMessage} />
        <PrimaryButton label="Run test chat" onPress={runTestChat} disabled={busy === "test"} />
        {testReply ? <Text style={styles.reply}>{testReply}</Text> : null}
      </Section>

      <Section title="Team">
        {team.map((member) => (
          <View key={member.userId} style={styles.member}>
            <View style={styles.memberText}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberMeta}>
                {member.email} · {member.role} · {member.status}
              </Text>
            </View>
            {canManage && member.userId !== user?.userId ? (
              <View style={styles.memberActions}>
                <Pressable onPress={() => updateRole(member)} disabled={busy === member.userId}>
                  <Text style={styles.link}>{member.role === "viewer" ? "Make admin" : "Make viewer"}</Text>
                </Pressable>
                <Pressable onPress={() => removeMember(member)} disabled={busy === member.userId}>
                  <Text style={styles.dangerLink}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        <TextField label="Invite email" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" />
        <TextField label="Invite name" value={inviteName} onChangeText={setInviteName} />
        <PrimaryButton
          label="Invite viewer"
          onPress={inviteMember}
          disabled={!canManage || busy === "invite" || !inviteEmail.trim()}
        />
      </Section>

      <Section title="Usage and billing">
        <InfoRow label="Current plan" value={billing?.subscription.plan ?? tenant?.plan} />
        <InfoRow label="Billing status" value={billing?.subscription.status ?? tenant?.status} />
        <InfoRow label="Messages this period" value={usage?.messages} />
        <InfoRow label="Messages remaining" value={billing?.resources.messagesRemaining ?? usage?.limits.messagesRemaining} />
        <InfoRow label="Estimated cost" value={usage ? `$${usage.estimatedLlmCostUsd.toFixed(2)}` : undefined} />
        {billing?.subscription.cancelAtPeriodEnd ? (
          <PrimaryButton
            label="Reactivate plan"
            onPress={() => {
              setBusy("reactivate");
              void api.billing.reactivate().then(load).catch((e) => {
                setError((e as { message?: string }).message ?? "Reactivate failed");
                setBusy(null);
              });
            }}
            disabled={!canBill || busy === "reactivate"}
          />
        ) : (
          <PrimaryButton
            label="Cancel plan"
            onPress={() => {
              Alert.alert("Cancel plan?", "Your subscription will end at the current period end.", [
                { text: "Keep plan", style: "cancel" },
                {
                  text: "Cancel plan",
                  style: "destructive",
                  onPress: () => {
                    setBusy("cancel");
                    void api.billing.cancel().then(load).catch((e) => {
                      setError((e as { message?: string }).message ?? "Cancel failed");
                      setBusy(null);
                    });
                  },
                },
              ]);
            }}
            disabled={!canBill || busy === "cancel"}
            danger
          />
        )}
        <PrimaryButton
          label="Open billing portal"
          onPress={() => void Linking.openURL("https://commercechat.local/billing")}
          disabled={!canBill}
        />
      </Section>

      <Section title="Account">
        <InfoRow label="Signed in as" value={user?.email} />
        <InfoRow label="Email verified" value={user?.emailVerified ? "Yes" : "No"} />
        <PrimaryButton label="Logout" onPress={logout} danger />
      </Section>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  channel: { gap: 8 },
  stepRow: { gap: 6 },
  member: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 6,
  },
  memberText: { gap: 2 },
  memberName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  memberMeta: { color: colors.textMuted, fontSize: 11 },
  memberActions: { flexDirection: "row", gap: 12 },
  link: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  dangerLink: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  reply: {
    backgroundColor: colors.softSurface,
    color: colors.text,
    borderRadius: 9,
    padding: 9,
    lineHeight: 18,
    fontSize: 12,
  },
});
