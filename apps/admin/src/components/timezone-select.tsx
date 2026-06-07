"use client";

import { useMemo } from "react";
import { buildTimezoneOptions } from "@/lib/timezones";
import { cn } from "@/lib/utils";

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}

export function TimezoneSelect({ value, onChange, id, disabled }: TimezoneSelectProps) {
  const options = useMemo(() => buildTimezoneOptions(value), [value]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const option of options) {
      const list = map.get(option.region) ?? [];
      list.push(option);
      map.set(option.region, list);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      {groups.map(([region, items]) => (
        <optgroup key={region} label={region}>
          {items.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
