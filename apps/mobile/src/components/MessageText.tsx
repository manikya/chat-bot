import { Platform, StyleSheet, Text, type TextStyle } from "react-native";

type Segment = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function parseInline(text: string): Segment[] {
  if (!text) return [{ text: "" }];

  const segments: Segment[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("**")) {
      segments.push({ text: raw.slice(2, -2), bold: true });
    } else if (raw.startsWith("`")) {
      segments.push({ text: raw.slice(1, -1), code: true });
    } else {
      segments.push({ text: raw.slice(1, -1), italic: true });
    }
    last = match.index + raw.length;
  }

  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }
  return segments.length ? segments : [{ text }];
}

/** Render bot/customer text with basic markdown (bold, italic, code). */
export function MessageText({ content, style }: { content: string; style?: TextStyle }) {
  const safe = typeof content === "string" ? content : String(content ?? "");
  const lines = safe.replace(/\r\n/g, "\n").split("\n");

  return (
    <Text style={style}>
      {lines.map((line, lineIndex) => (
        <Text key={`line-${lineIndex}`}>
          {lineIndex > 0 ? "\n" : ""}
          {parseInline(line).map((segment, segmentIndex) => {
            if (!segment.text) return null;
            return (
              <Text
                key={`seg-${lineIndex}-${segmentIndex}`}
                style={[
                  segment.bold ? styles.bold : undefined,
                  segment.italic ? styles.italic : undefined,
                  segment.code ? styles.code : undefined,
                ]}
              >
                {segment.text}
              </Text>
            );
          })}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  code: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: "rgba(0,0,0,0.06)",
  },
});
