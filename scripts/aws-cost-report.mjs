#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultStart() {
  const d = new Date();
  d.setUTCDate(1);
  return isoDate(d);
}

function defaultEnd() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return isoDate(d);
}

const start = arg("start", defaultStart());
const end = arg("end", defaultEnd());
const project = arg("project", "CommerceChat");
const env = arg("env", "");
const granularity = arg("granularity", "MONTHLY");

const filter = {
  And: [
    {
      Tags: {
        Key: "Project",
        Values: [project],
        MatchOptions: ["EQUALS"],
      },
    },
  ],
};

if (env) {
  filter.And.push({
    Tags: {
      Key: "Environment",
      Values: [env],
      MatchOptions: ["EQUALS"],
    },
  });
}

function awsJson(args) {
  const out = execFileSync("aws", args, { encoding: "utf8" });
  return JSON.parse(out);
}

function costForGroup(group) {
  const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);
  const unit = group.Metrics?.UnblendedCost?.Unit ?? "USD";
  return { amount, unit };
}

function printTable(title, groups) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  if (!groups.length) {
    console.log("No matching cost data. Check date range, account, region, and activated tags.");
    return;
  }
  for (const group of groups) {
    const keys = group.Keys?.join(" / ") || "(untagged)";
    const { amount, unit } = costForGroup(group);
    console.log(`${keys.padEnd(42)} ${amount.toFixed(2)} ${unit}`);
  }
}

const baseArgs = [
  "ce",
  "get-cost-and-usage",
  "--time-period",
  JSON.stringify({ Start: start, End: end }),
  "--granularity",
  granularity,
  "--metrics",
  "UnblendedCost",
  "--filter",
  JSON.stringify(filter),
];

const byCostGroup = awsJson([
  ...baseArgs,
  "--group-by",
  JSON.stringify([{ Type: "TAG", Key: "CostGroup" }]),
]);

const byService = awsJson([
  ...baseArgs,
  "--group-by",
  JSON.stringify([{ Type: "DIMENSION", Key: "SERVICE" }]),
]);

const costGroupRows = byCostGroup.ResultsByTime.flatMap((period) => period.Groups ?? []);
const serviceRows = byService.ResultsByTime.flatMap((period) => period.Groups ?? []);

console.log(`CommerceChat AWS cost report (${start} to ${end}, ${granularity})`);
console.log(`Project=${project}${env ? ` Environment=${env}` : ""}`);
printTable("Cost by CostGroup tag", costGroupRows);
printTable("Cost by AWS service", serviceRows);
