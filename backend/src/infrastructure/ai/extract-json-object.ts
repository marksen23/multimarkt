/**
 * Modelle halten sich nicht immer an „nur JSON“. Ein Markdown-Zaun oder
 * ein Satz davor wird abgeschnitten. Liefert null, wenn kein Objekt
 * übrig bleibt — der Aufrufer erfindet dann keine Werte.
 */
export function extractJsonObject(text: string | undefined | null): Record<string, unknown> | null {
  if (!text?.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const direct = parseObject(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return parseObject(cleaned.slice(start, end + 1));
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
