import { api } from "@/lib/api";
import type { IngestJob } from "@commercechat/mock-api";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export async function pollIngestJob(
  jobId: string,
  onUpdate: (job: IngestJob) => void,
  intervalMs = 1500
): Promise<IngestJob> {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await api.knowledge.getJob(jobId);
        const job = res.data as IngestJob;
        onUpdate(job);
        if (TERMINAL.has(job.status)) {
          clearInterval(handle);
          if (job.status === "failed") {
            reject(new Error(job.error ?? "Ingest job failed"));
          } else {
            resolve(job);
          }
        }
      } catch (err) {
        clearInterval(handle);
        reject(err);
      }
    };
    void tick();
    const handle = setInterval(() => void tick(), intervalMs);
  });
}
