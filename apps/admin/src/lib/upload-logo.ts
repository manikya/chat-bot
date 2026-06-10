import { api } from "@/lib/api";

export async function uploadTenantLogoFile(file: File) {
  const contentType = file.type || "application/octet-stream";

  try {
    const presign = await api.tenant.presignLogo(contentType);
    const putRes = await fetch(presign.data.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    });
    if (!putRes.ok) {
      throw new Error(`S3 upload failed (${putRes.status})`);
    }
    return api.tenant.completeLogo(presign.data.key);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    const msg = err instanceof Error ? err.message : "";
    if (code === "VALIDATION_ERROR" && msg.includes("S3")) {
      return api.tenant.uploadLogo(file);
    }
    throw err;
  }
}
