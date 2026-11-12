/**
 * `response.text` ist bei manchen Gemini-Antworten leer, obwohl der JSON-Text
 * in einem Part steht. Thought-Parts gehören nicht zur Antwort.
 */
export function readGeminiText(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const root = response as { text?: unknown; candidates?: unknown };
  if (typeof root.text === 'string' && root.text.trim()) return root.text;
  if (!Array.isArray(root.candidates)) return undefined;

  for (const candidate of root.candidates) {
    const parts = (candidate as { content?: { parts?: unknown } } | null)?.content?.parts;
    if (!Array.isArray(parts)) continue;
    const texts: string[] = [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const record = part as { text?: unknown; thought?: unknown };
      if (record.thought === true) continue;
      if (typeof record.text === 'string' && record.text.trim()) texts.push(record.text);
    }
    const joined = texts.join('\n').trim();
    if (joined) return joined;
  }
  return undefined;
}
