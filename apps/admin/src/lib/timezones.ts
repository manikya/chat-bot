export interface TimezoneOption {
  value: string;
  label: string;
  region: string;
}

function formatOffset(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  } catch {
    return "UTC";
  }
}

function formatLabel(timeZone: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return `${formatOffset(timeZone)} — ${city}`;
}

const CURATED: Array<{ region: string; zones: string[] }> = [
  {
    region: "Americas",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Toronto",
      "America/Mexico_City",
      "America/Sao_Paulo",
    ],
  },
  {
    region: "Europe & Africa",
    zones: [
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Amsterdam",
      "Europe/Madrid",
      "Europe/Athens",
      "Europe/Istanbul",
      "Africa/Cairo",
      "Africa/Johannesburg",
      "Africa/Lagos",
    ],
  },
  {
    region: "Asia & Pacific",
    zones: [
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Colombo",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Hong_Kong",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Australia/Sydney",
      "Australia/Melbourne",
      "Pacific/Auckland",
    ],
  },
];

export const TIMEZONE_OPTIONS: TimezoneOption[] = CURATED.flatMap(({ region, zones }) =>
  zones.map((value) => ({ value, label: formatLabel(value), region }))
);

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export function buildTimezoneOptions(currentValue?: string): TimezoneOption[] {
  const browserTz = getBrowserTimezone();
  const options = [...TIMEZONE_OPTIONS];
  const seen = new Set(options.map((o) => o.value));

  const extras: TimezoneOption[] = [];
  if (browserTz && !seen.has(browserTz)) {
    extras.push({ value: browserTz, label: `${formatLabel(browserTz)} (your device)`, region: "Suggested" });
    seen.add(browserTz);
  }
  if (currentValue && !seen.has(currentValue)) {
    extras.push({
      value: currentValue,
      label: `${formatLabel(currentValue)} (saved)`,
      region: "Suggested",
    });
  }

  return [...extras, ...options];
}
