#!/usr/bin/env node
// Wartet, bis /healthz und /ready 200 mit dem erwarteten Inhalt liefern.
// Ein HTML-200 (SPA-Fallback) gilt nicht als gesund.
//
// Aufruf: node scripts/ci-wait-healthy.mjs <baseUrl> <timeoutMs> [pid]
// Der optionale PID bricht sofort ab, wenn der Prozess vorher stirbt.

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const timeoutMs = Number(process.argv[3] ?? 90_000);
const pid = process.argv[4] ? Number(process.argv[4]) : undefined;

const expectedHealth = 'Personal Resale OS V2 — backend running.';

function processAlive() {
  if (!pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probe() {
  const healthRes = await fetch(`${base}/healthz`);
  const healthBody = await healthRes.text();
  const readyRes = await fetch(`${base}/ready`);
  const readyText = await readyRes.text();
  let ready = null;
  try {
    ready = JSON.parse(readyText);
  } catch {
    ready = null;
  }
  const healthOk = healthRes.status === 200 && healthBody === expectedHealth;
  const readyOk =
    readyRes.status === 200 &&
    ready?.status === 'ready' &&
    ready?.database === 'ok' &&
    ready?.redis === 'ok';
  return {
    healthOk,
    readyOk,
    healthStatus: healthRes.status,
    healthBody,
    readyStatus: readyRes.status,
    readyText,
  };
}

const started = Date.now();
let last = null;

while (Date.now() - started < timeoutMs) {
  if (!processAlive()) {
    console.error(
      `Prozess ${pid} ist beendet, bevor /healthz und /ready 200 geliefert haben.`,
    );
    process.exit(1);
  }
  try {
    last = await probe();
    if (last.healthOk && last.readyOk) {
      console.log(`/healthz und /ready antworten mit 200 (${base}).`);
      process.exit(0);
    }
  } catch (error) {
    last = { error: error instanceof Error ? error.message : String(error) };
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.error(`Zeitüberschreitung nach ${timeoutMs} ms. Letzte Antwort:`);
console.error(JSON.stringify(last, null, 2));
process.exit(1);
