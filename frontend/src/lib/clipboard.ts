/**
 * `navigator.clipboard` gibt es nur in sicheren Kontexten (HTTPS/localhost).
 * Im Heimnetz (`http://192.168.x.x:3000` vom Handy aus) fehlt es — dann
 * kopiert der Fallback über ein verstecktes Textfeld.
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Kopieren nicht möglich');
}
