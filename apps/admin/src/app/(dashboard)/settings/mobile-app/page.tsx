"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { IconFrame, MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";

const WEB_EXPECTED_MOBILE_VERSION = process.env.NEXT_PUBLIC_MOBILE_APP_VERSION ?? "1.0.0";

type MobileReleaseManifest = {
  platform: "android" | "ios" | string;
  channel: string;
  latestVersion: string;
  minimumSupportedVersion?: string;
  currentWebExpectedVersion?: string;
  apkUrl?: string;
  buildUrl?: string;
  fileName?: string;
  releasedAt?: string;
  sizeBytes?: number | null;
  updateAvailable?: boolean;
  notes?: string[];
};

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "Pending";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function releaseDate(value?: string) {
  if (!value) return "Pending upload";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function MobileAppSettingsPage() {
  const [release, setRelease] = useState<MobileReleaseManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRelease() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/mobile-release.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load mobile release manifest");
      setRelease((await response.json()) as MobileReleaseManifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load mobile release manifest");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRelease();
  }, []);

  const updateAvailable = useMemo(() => {
    if (!release) return false;
    if (typeof release.updateAvailable === "boolean") return release.updateAvailable;
    return compareVersions(release.latestVersion, WEB_EXPECTED_MOBILE_VERSION) > 0;
  }, [release]);

  const installUrl = release?.apkUrl || release?.buildUrl || "";

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Mobile app"
        title="Track the Android APK merchants should install."
        description="This page reads the published release manifest used by the web admin to show the latest APK version, upload state, and whether a newer release is available."
        action={
          <Badge variant={updateAvailable ? "warning" : "success"}>
            {updateAvailable ? "update available" : "current"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Using"
          value={WEB_EXPECTED_MOBILE_VERSION}
          detail="web expected APK"
          icon={<Smartphone className="h-4 w-4" />}
        />
        <MetricTile
          label="Latest"
          value={release?.latestVersion ?? (loading ? "..." : "unknown")}
          detail={release?.channel ?? "release channel"}
          icon={<Download className="h-4 w-4" />}
        />
        <MetricTile
          label="Minimum"
          value={release?.minimumSupportedVersion ?? "n/a"}
          detail="supported APK"
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <MetricTile
          label="Size"
          value={formatBytes(release?.sizeBytes)}
          detail="APK artifact"
          icon={<ExternalLink className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Android"
            title="APK release"
            description="Use the uploaded APK link for internal installs. When the latest version is newer than the version currently expected by the web admin, this page marks it as updatable."
          />
          <IconFrame>
            <Smartphone className="h-4 w-4" />
          </IconFrame>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">File</p>
              <p className="mt-1 break-all text-sm font-medium">{release?.fileName ?? "Pending APK build"}</p>
            </div>
            <div className="rounded-lg border bg-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Released</p>
              <p className="mt-1 text-sm font-medium">{releaseDate(release?.releasedAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild disabled={!installUrl}>
              <a href={installUrl || "#"} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                {release?.apkUrl ? "Download APK" : release?.buildUrl ? "Open build" : "APK pending"}
              </a>
            </Button>
            <Button variant="outline" onClick={() => void loadRelease()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh status
            </Button>
          </div>

          {release?.notes?.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Release notes</p>
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {release.notes.map((note) => (
                  <li key={note} className="rounded-lg border bg-white px-3 py-2">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
