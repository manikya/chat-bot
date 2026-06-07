export interface MultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

export function parseMultipart(body: Buffer, contentType: string): MultipartField[] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new Error("Missing multipart boundary");
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const parts: MultipartField[] = [];
  let start = body.indexOf(delimiter);
  if (start < 0) return parts;

  while (start >= 0) {
    let end = body.indexOf(delimiter, start + delimiter.length);
    if (end < 0) end = body.length;

    const slice = body.subarray(start + delimiter.length, end);
    const part = slice.toString("binary");
    if (part.startsWith("--")) break;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      start = end;
      continue;
    }

    const headerBlock = part.slice(0, headerEnd);
    const bodyBinary = part.slice(headerEnd + 4).replace(/\r\n$/, "");

    const disposition = /content-disposition:[^\r\n]+/i.exec(headerBlock)?.[0] ?? "";
    const nameMatch = /name="([^"]+)"/i.exec(disposition);
    const filenameMatch = /filename="([^"]+)"/i.exec(disposition);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerBlock);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1]!,
        filename: filenameMatch?.[1],
        contentType: typeMatch?.[1]?.trim(),
        data: Buffer.from(bodyBinary, "binary"),
      });
    }

    start = end;
  }

  return parts;
}

export function getMultipartBody(event: {
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}): Buffer {
  if (!event.body) return Buffer.alloc(0);
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");
}

export function getRequestContentType(event: {
  headers?: Record<string, string | undefined>;
}): string {
  return event.headers?.["content-type"] ?? event.headers?.["Content-Type"] ?? "";
}
