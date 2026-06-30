import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  AiWalletOverview,
  BillingOverview,
  ChannelInfo,
  OnboardingState,
  TeamMember,
  TenantConfig,
  Usage,
} from "@commercechat/mock-api";
import type { MobileAiDevicePreferences, MobileAiSyncState } from "@commercechat/shared/types";
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
import {
  DEFAULT_MOBILE_AI_PREFERENCES,
  loadMobileAiPreferences,
  loadMobileAiSyncState,
  saveMobileAiSyncState,
  patchMobileAiPreferences,
} from "../../../src/lib/offline-ai-preferences";
import {
  formatModelBytes,
  getConfiguredMobileAiModel,
  pauseMobileAiModelDownload,
  removeMobileAiModel,
  resumeMobileAiModelDownload,
  startMobileAiModelDownload,
} from "../../../src/lib/mobile-ai-model-manager";
import { colors } from "../../../src/theme/colors";

export default function SettingsScreen() {
  const { tenant, user, logout, refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [aiWallet, setAiWallet] = useState<AiWalletOverview | null>(null);
  const [storeName, setStoreName] = useState(tenant?.storeName ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(tenant?.websiteUrl ?? "");
  const [timezone, setTimezone] = useState(tenant?.timezone ?? "");
  const [greeting, setGreeting] = useState("");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState("");
  const [manualRepliesOnly, setManualRepliesOnly] = useState(false);
  const [mobileAiPrefs, setMobileAiPrefs] = useState<MobileAiDevicePreferences>(
    DEFAULT_MOBILE_AI_PREFERENCES
  );
  const [mobileAiSyncState, setMobileAiSyncState] = useState<MobileAiSyncState>({
    status: "not_synced",
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [testMessage, setTestMessage] = useState("Do you have best sellers?");
  const [testReply, setTestReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === "owner" || user?.role === "admin";
  const canBill = user?.role === "owner";
  const configuredModel = getConfiguredMobileAiModel();

  async function load() {
    setError(null);
    try {
      const [channelsRes, configRes, teamRes, onboardingRes, usageRes, billingRes, aiWalletRes] = await Promise.all([
        api.channels.list(),
        api.tenant.getConfig(),
        api.team.list(),
        api.onboarding.getState(),
        api.tenant.getUsage(),
        api.billing.getOverview(),
        api.billing.getAiWallet().catch(() => null),
      ]);
      setChannels(channelsRes.data.channels);
      setConfig(configRes.data);
      setTeam(teamRes.data.items);
      setOnboarding(onboardingRes.data);
      setUsage(usageRes.data);
      setBilling(billingRes.data);
      setAiWallet(aiWalletRes?.data ?? null);
      setStoreName(tenant?.storeName ?? "");
      setWebsiteUrl(tenant?.websiteUrl ?? "");
      setTimezone(tenant?.timezone ?? "");
      setGreeting(configRes.data.prompts.greeting);
      setHandoffMessage(configRes.data.prompts.handoffMessage);
      setSystemPrompt(configRes.data.prompts.systemPrompt);
      setSuggestedQuestions(configRes.data.widgetConfig.suggestedQuestions.join("\n"));
      setManualRepliesOnly(Boolean(configRes.data.featureFlags?.manualRepliesOnly));
      const [prefs, syncState] = await Promise.all([
        loadMobileAiPreferences(),
        loadMobileAiSyncState(),
      ]);
      setMobileAiPrefs(prefs);
      setMobileAiSyncState(syncState);
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
        featureFlags: {
          ...config.featureFlags,
          manualRepliesOnly,
        },
      });
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not save bot settings");
      setBusy(null);
    }
  }

  async function topUpAiWallet() {
    setBusy("ai-wallet");
    try {
      const res = await api.billing.topUpAiWallet({ amountMinor: 100000, currency: "LKR" });
      setAiWallet(res.data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not top up AI wallet");
    } finally {
      setBusy(null);
    }
  }

  async function resumeAiWallet() {
    setBusy("ai-wallet-resume");
    try {
      const res = await api.billing.resumeAiWallet();
      setAiWallet(res.data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not resume AI replies");
    } finally {
      setBusy(null);
    }
  }

  async function updateMobileAiPreferences(patch: Partial<MobileAiDevicePreferences>) {
    const next = await patchMobileAiPreferences(patch);
    setMobileAiPrefs(next);
  }

  async function syncMobileVectorsNow() {
    if (!mobileAiPrefs.allowVectorSync) return;
    setBusy("mobile-ai-sync");
    try {
      const manifest = await api.mobileAi.getSnapshotManifest();
      const delta = await api.mobileAi.getSnapshotChunks({
        sinceVersion: mobileAiSyncState.version,
        maxChunks: 100,
      });
      const nextState: MobileAiSyncState = {
        status: "ready",
        tenantId: manifest.data.tenantId,
        snapshotId: manifest.data.snapshotId,
        version: delta.data.toVersion,
        chunkCount: manifest.data.chunkCount,
        lastSyncedAt: new Date().toISOString(),
        expiresAt: manifest.data.expiresAt,
      };
      await saveMobileAiSyncState(nextState);
      setMobileAiSyncState(nextState);
    } catch (e) {
      const nextState: MobileAiSyncState = {
        ...mobileAiSyncState,
        status: mobileAiSyncState.version ? "stale" : "error",
        errorMessage: (e as { message?: string }).message ?? "Vector sync failed",
      };
      await saveMobileAiSyncState(nextState);
      setMobileAiSyncState(nextState);
      setError(nextState.errorMessage ?? "Vector sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadLlmModel() {
    setBusy("mobile-ai-model");
    try {
      const next = await startMobileAiModelDownload(setMobileAiPrefs);
      setMobileAiPrefs(next);
      if (next.modelStatus === "download_pending") {
        Alert.alert("Model download not configured", next.modelErrorMessage);
      }
    } catch (e) {
      const next = await patchMobileAiPreferences({
        modelStatus: "error",
        modelErrorMessage: (e as { message?: string }).message ?? "Model download failed.",
      });
      setMobileAiPrefs(next);
      setError(next.modelErrorMessage ?? "Model download failed");
    } finally {
      setBusy(null);
    }
  }

  async function resumeLlmModelDownload() {
    setBusy("mobile-ai-model");
    try {
      const next = await resumeMobileAiModelDownload(setMobileAiPrefs);
      setMobileAiPrefs(next);
    } catch (e) {
      const next = await patchMobileAiPreferences({
        modelStatus: "error",
        modelErrorMessage: (e as { message?: string }).message ?? "Model resume failed.",
      });
      setMobileAiPrefs(next);
      setError(next.modelErrorMessage ?? "Model resume failed");
    } finally {
      setBusy(null);
    }
  }

  async function pauseLlmModelDownload() {
    const next = await pauseMobileAiModelDownload();
    setMobileAiPrefs(next);
  }

  function removeLlmModel() {
    Alert.alert("Remove local model?", "The phone will delete the downloaded LLM file.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy("mobile-ai-model");
          try {
            setMobileAiPrefs(await removeMobileAiModel());
          } catch (e) {
            setError((e as { message?: string }).message ?? "Could not remove local model");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
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
        <Pressable
          style={[styles.toggleRow, manualRepliesOnly && styles.toggleRowActive]}
          onPress={() => setManualRepliesOnly((value) => !value)}
          disabled={!canManage || busy === "bot"}
        >
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Manual reply mode</Text>
            <Text style={styles.toggleDescription}>
              {manualRepliesOnly
                ? "AI auto-replies are paused. New messages go to agents."
                : "AI replies automatically unless a thread is taken over."}
            </Text>
          </View>
          <Text style={[styles.toggleBadge, manualRepliesOnly && styles.toggleBadgeActive]}>
            {manualRepliesOnly ? "Manual" : "AI"}
          </Text>
        </Pressable>
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

      <Section title="Offline AI">
        <Pressable
          style={[styles.toggleRow, mobileAiPrefs.allowLlmDownload && styles.toggleRowActive]}
          onPress={() =>
            void updateMobileAiPreferences({ allowLlmDownload: !mobileAiPrefs.allowLlmDownload })
          }
          disabled={!canManage}
        >
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Allow local LLM download</Text>
            <Text style={styles.toggleDescription}>
              {mobileAiPrefs.allowLlmDownload
                ? "This phone may download and run a local model when supported."
                : "The app will not download an LLM to this phone."}
            </Text>
          </View>
          <Text style={[styles.toggleBadge, mobileAiPrefs.allowLlmDownload && styles.toggleBadgeActive]}>
            {mobileAiPrefs.allowLlmDownload ? "Allowed" : "Off"}
          </Text>
        </Pressable>
        <PrimaryButton
          label={
            mobileAiPrefs.modelStatus === "paused"
              ? "Resume local LLM"
              : mobileAiPrefs.modelStatus === "ready" && mobileAiPrefs.modelAvailableVersion
                ? "Update local LLM"
                : mobileAiPrefs.modelStatus === "ready"
                  ? "Local LLM ready"
                  : mobileAiPrefs.modelStatus === "downloading"
                    ? "Downloading local LLM"
                    : "Download local LLM"
          }
          onPress={
            mobileAiPrefs.modelStatus === "paused"
              ? resumeLlmModelDownload
              : downloadLlmModel
          }
          disabled={
            !canManage ||
            !mobileAiPrefs.allowLlmDownload ||
            busy === "mobile-ai-model" ||
            mobileAiPrefs.modelStatus === "downloading" ||
            (mobileAiPrefs.modelStatus === "ready" && !mobileAiPrefs.modelAvailableVersion)
          }
        />
        <InfoRow label="Model" value={mobileAiPrefs.modelDisplayName ?? configuredModel.displayName} />
        <InfoRow label="Version" value={mobileAiPrefs.modelVersion ?? configuredModel.version} />
        <InfoRow
          label="Model size"
          value={formatModelBytes(mobileAiPrefs.modelSizeBytes ?? configuredModel.sizeBytes)}
        />
        <InfoRow
          label="Downloaded"
          value={`${formatModelBytes(mobileAiPrefs.modelDownloadedBytes)}${
            mobileAiPrefs.modelDownloadProgressPct !== undefined
              ? ` · ${mobileAiPrefs.modelDownloadProgressPct}%`
              : ""
          }`}
        />
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${mobileAiPrefs.modelDownloadProgressPct ?? 0}%` },
            ]}
          />
        </View>
        <View style={styles.inlineActions}>
          <Pressable
            onPress={pauseLlmModelDownload}
            disabled={!canManage || mobileAiPrefs.modelStatus !== "downloading"}
          >
            <Text
              style={[
                styles.link,
                mobileAiPrefs.modelStatus !== "downloading" && styles.linkDisabled,
              ]}
            >
              Pause
            </Text>
          </Pressable>
          <Pressable
            onPress={resumeLlmModelDownload}
            disabled={!canManage || mobileAiPrefs.modelStatus !== "paused"}
          >
            <Text
              style={[
                styles.link,
                mobileAiPrefs.modelStatus !== "paused" && styles.linkDisabled,
              ]}
            >
              Resume
            </Text>
          </Pressable>
          <Pressable
            onPress={removeLlmModel}
            disabled={
              !canManage ||
              busy === "mobile-ai-model" ||
              mobileAiPrefs.modelStatus === "not_downloaded" ||
              mobileAiPrefs.modelStatus === "downloading"
            }
          >
            <Text
              style={[
                styles.dangerLink,
                (mobileAiPrefs.modelStatus === "not_downloaded" ||
                  mobileAiPrefs.modelStatus === "downloading") &&
                  styles.linkDisabled,
              ]}
            >
              Remove
            </Text>
          </Pressable>
        </View>
        {mobileAiPrefs.modelErrorMessage ? (
          <Text style={styles.reply}>{mobileAiPrefs.modelErrorMessage}</Text>
        ) : null}

        <Pressable
          style={[styles.toggleRow, mobileAiPrefs.allowVectorSync && styles.toggleRowActive]}
          onPress={() =>
            void updateMobileAiPreferences({ allowVectorSync: !mobileAiPrefs.allowVectorSync })
          }
          disabled={!canManage}
        >
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Allow local vector sync</Text>
            <Text style={styles.toggleDescription}>
              {mobileAiPrefs.allowVectorSync
                ? "This phone may keep a local copy of tenant knowledge for offline search."
                : "Tenant vectors stay in the cloud only."}
            </Text>
          </View>
          <Text style={[styles.toggleBadge, mobileAiPrefs.allowVectorSync && styles.toggleBadgeActive]}>
            {mobileAiPrefs.allowVectorSync ? "Allowed" : "Off"}
          </Text>
        </Pressable>
        <InfoRow label="Vector sync" value={mobileAiSyncState.status} />
        <InfoRow label="Local chunks" value={mobileAiSyncState.chunkCount ?? 0} />
        <InfoRow label="Last synced" value={mobileAiSyncState.lastSyncedAt ?? "Never"} />
        <PrimaryButton
          label="Sync tenant vectors now"
          onPress={syncMobileVectorsNow}
          disabled={!canManage || !mobileAiPrefs.allowVectorSync || busy === "mobile-ai-sync"}
        />

        <Pressable
          style={[styles.toggleRow, mobileAiPrefs.replyMode === "draft" && styles.toggleRowActive]}
          onPress={() => void updateMobileAiPreferences({ replyMode: "draft" })}
          disabled={!canManage}
        >
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Show AI drafts first</Text>
            <Text style={styles.toggleDescription}>
              Local AI prepares a reply for an agent to review before sending.
            </Text>
          </View>
          <Text style={[styles.toggleBadge, mobileAiPrefs.replyMode === "draft" && styles.toggleBadgeActive]}>
            {mobileAiPrefs.replyMode === "draft" ? "Selected" : "Choose"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleRow, mobileAiPrefs.replyMode === "auto" && styles.toggleRowActive]}
          onPress={() => void updateMobileAiPreferences({ replyMode: "auto" })}
          disabled={!canManage}
        >
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Auto-reply when safe</Text>
            <Text style={styles.toggleDescription}>
              Local AI may send low-risk replies automatically; live commerce actions still verify in cloud.
            </Text>
          </View>
          <Text style={[styles.toggleBadge, mobileAiPrefs.replyMode === "auto" && styles.toggleBadgeActive]}>
            {mobileAiPrefs.replyMode === "auto" ? "Selected" : "Choose"}
          </Text>
        </Pressable>
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
        <InfoRow
          label="AI wallet"
          value={
            aiWallet
              ? `LKR ${(aiWallet.wallet.balanceMinor / 100).toLocaleString()} · ${aiWallet.wallet.status}`
              : "Not enabled"
          }
          tone={aiWallet?.wallet.status === "empty" ? "warn" : aiWallet?.wallet.status === "active" ? "good" : "default"}
        />
        <PrimaryButton
          label="Add LKR 1,000 AI credit"
          onPress={topUpAiWallet}
          disabled={!canBill || busy === "ai-wallet"}
        />
        {aiWallet?.wallet.prepaidAiEnabled && aiWallet.wallet.balanceMinor > 0 ? (
          <PrimaryButton
            label="Resume AI replies"
            onPress={resumeAiWallet}
            disabled={!canBill || busy === "ai-wallet-resume"}
          />
        ) : null}
        {aiWallet?.wallet.status === "empty" ? (
          <Text style={styles.reply}>AI credit is empty. New messages are routed to manual reply mode.</Text>
        ) : aiWallet?.wallet.status === "low" ? (
          <Text style={styles.reply}>AI credit is low. Top up soon to keep auto-replies running.</Text>
        ) : null}
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
  linkDisabled: { color: colors.textMuted },
  inlineActions: { flexDirection: "row", gap: 16, alignItems: "center" },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  toggleRow: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.listBg,
  },
  toggleRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.softSurface,
  },
  toggleText: { flex: 1, gap: 3 },
  toggleTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  toggleDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  toggleBadge: {
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  toggleBadgeActive: {
    color: colors.headerText,
    backgroundColor: colors.primary,
  },
  reply: {
    backgroundColor: colors.softSurface,
    color: colors.text,
    borderRadius: 9,
    padding: 9,
    lineHeight: 18,
    fontSize: 12,
  },
});
