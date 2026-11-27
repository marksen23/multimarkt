import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { parseEbayErrors } from '../../domain/listing/ebay-api-errors';
import { ebaySellGaps, ebayValueConfigured, type EbaySellEnv } from '../../domain/listing/ebay-sell-readiness';
import type {
  EbayCatalog,
  EbayConnectionRecord,
  EbayLocationOption,
  EbayPolicyOption,
  EbaySelection,
  EbaySelectionSource,
  EbaySetupView,
  EbayValueSource,
} from './ebay-setup.types';

export interface ResolvedEbayConfig {
  env: EbaySellEnv;
  connectionSource: EbayValueSource;
  selectionSource: EbaySelectionSource;
  selection: EbaySelection;
  record: EbayConnectionRecord | null;
  tokenUnreadable: boolean;
}

const SOON_MS = 14 * 24 * 60 * 60 * 1000;
const NOT_OPTED_IN_IDS = new Set([20400, 20401, 20402, 20403, 20500, 20501]);

export function resolveEbayConfig(input: {
  env: EbaySellEnv;
  record: EbayConnectionRecord | null;
  decryptedToken: string | null;
  tokenUnreadable: boolean;
}): ResolvedEbayConfig {
  const refresh = ebayValueConfigured(input.decryptedToken)
    ? { value: input.decryptedToken!.trim(), source: 'database' as const }
    : pick(null, input.env.refreshToken);
  const fulfillment = pick(input.record?.fulfillmentPolicyId, input.env.fulfillmentPolicyId);
  const payment = pick(input.record?.paymentPolicyId, input.env.paymentPolicyId);
  const returns = pick(input.record?.returnPolicyId, input.env.returnPolicyId);
  const pickup = pick(input.record?.pickupFulfillmentPolicyId, input.env.pickupFulfillmentPolicyId);
  const location = pick(input.record?.merchantLocationKey, input.env.merchantLocationKey);
  return {
    env: {
      clientId: input.env.clientId,
      clientSecret: input.env.clientSecret,
      refreshToken: refresh.value,
      fulfillmentPolicyId: fulfillment.value,
      paymentPolicyId: payment.value,
      returnPolicyId: returns.value,
      pickupFulfillmentPolicyId: pickup.value,
      merchantLocationKey: location.value,
      environment: input.env.environment,
    },
    connectionSource: refresh.source,
    selectionSource: {
      fulfillmentPolicyId: fulfillment.source,
      paymentPolicyId: payment.source,
      returnPolicyId: returns.source,
      pickupFulfillmentPolicyId: pickup.source,
      merchantLocationKey: location.source,
    },
    selection: {
      fulfillmentPolicyId: fulfillment.value,
      paymentPolicyId: payment.value,
      returnPolicyId: returns.value,
      pickupFulfillmentPolicyId: pickup.value,
      merchantLocationKey: location.value,
    },
    record: input.record,
    tokenUnreadable: input.tokenUnreadable,
  };
}

export function planAutoSelection(
  resolved: ResolvedEbayConfig,
  catalog: EbayCatalog,
): { patch: Partial<EbayConnectionRecord>; fields: Array<keyof EbaySelection> } {
  const patch: Partial<EbayConnectionRecord> = {};
  const fields: Array<keyof EbaySelection> = [];
  const take = (
    field: keyof EbaySelection,
    column: keyof EbayConnectionRecord,
    options: Array<{ id: string }>,
  ) => {
    if (resolved.selectionSource[field]) return;
    if (options.length !== 1) return;
    (patch as Record<string, string>)[column] = options[0].id;
    fields.push(field);
  };
  take('fulfillmentPolicyId', 'fulfillmentPolicyId', catalog.fulfillmentPolicies);
  take('paymentPolicyId', 'paymentPolicyId', catalog.paymentPolicies);
  take('returnPolicyId', 'returnPolicyId', catalog.returnPolicies);
  take(
    'pickupFulfillmentPolicyId',
    'pickupFulfillmentPolicyId',
    catalog.fulfillmentPolicies.filter((policy) => policy.localPickup),
  );
  take(
    'merchantLocationKey',
    'merchantLocationKey',
    catalog.locations.map((location) => ({ id: location.key })),
  );
  return { patch, fields };
}

export function applySelectionPatch(resolved: ResolvedEbayConfig, patch: Partial<EbayConnectionRecord>): ResolvedEbayConfig {
  const current = resolved.record;
  const userId = current ? current.userId : '';
  const ciphertext = current ? current.refreshTokenCiphertext : null;
  const next = resolveEbayConfig({
    env: {
      ...resolved.env,
      refreshToken: resolved.connectionSource === 'environment' ? resolved.env.refreshToken : null,
    },
    record: {
      ...(current ?? emptyRecord(userId)),
      ...patch,
      refreshTokenCiphertext: ciphertext,
    },
    decryptedToken: resolved.connectionSource === 'database' ? (resolved.env.refreshToken ?? null) : null,
    tokenUnreadable: resolved.tokenUnreadable,
  });
  return next;
}

export function ebayLocationKey(name: string, now = Date.now()): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = (now % 0xffff).toString(16).padStart(4, '0');
  return `${slug || 'lager'}-${suffix}`.slice(0, 36);
}

export function policiesNotOptedIn(status: number, body: unknown): boolean {
  if (parseEbayErrors(body).some((entry) => entry.errorId != null && NOT_OPTED_IN_IDS.has(entry.errorId))) return true;
  if (status !== 400 && status !== 403) return false;
  const text = JSON.stringify(body ?? '').toLowerCase();
  return text.includes('business polic') || text.includes('opted in') || text.includes('not eligible');
}

export function readPolicyList(body: unknown, listKey: string, idKey: string): EbayPolicyOption[] {
  if (!body || typeof body !== 'object') return [];
  const list = (body as Record<string, unknown>)[listKey];
  if (!Array.isArray(list)) return [];
  const options: EbayPolicyOption[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const rawId = (entry as Record<string, unknown>)[idKey];
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id) continue;
    const rawName = (entry as Record<string, unknown>).name;
    options.push({
      id,
      name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id,
      localPickup: (entry as Record<string, unknown>).localPickup === true,
    });
  }
  return options;
}

export function readLocations(body: unknown): EbayLocationOption[] {
  if (!body || typeof body !== 'object') return [];
  const list = (body as { locations?: unknown }).locations;
  if (!Array.isArray(list)) return [];
  const options: EbayLocationOption[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const keyRaw = (entry as { merchantLocationKey?: unknown }).merchantLocationKey;
    const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
    if (!key) continue;
    const address = ((entry as { location?: { address?: Record<string, unknown> } }).location?.address ??
      {}) as Record<string, unknown>;
    const nameRaw = (entry as { name?: unknown }).name;
    const statusRaw = (entry as { merchantLocationStatus?: unknown }).merchantLocationStatus;
    options.push({
      key,
      name: typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : key,
      city: textOrNull(address.city),
      postalCode: textOrNull(address.postalCode),
      country: textOrNull(address.country),
      status: textOrNull(statusRaw),
    });
  }
  return options;
}

export function withStoredPolicies(options: EbayPolicyOption[], selected: string | null): EbayPolicyOption[] {
  if (!selected || options.some((option) => option.id === selected)) return options;
  return [...options, { id: selected, name: `Gespeicherte Auswahl (${selected})`, localPickup: false, stale: true }];
}

export function withStoredLocation(options: EbayLocationOption[], selected: string | null): EbayLocationOption[] {
  if (!selected || options.some((option) => option.key === selected)) return options;
  return [
    ...options,
    {
      key: selected,
      name: `Gespeicherter Standort (${selected})`,
      city: null,
      postalCode: null,
      country: null,
      status: null,
      stale: true,
    },
  ];
}

export function buildEbaySetupView(input: {
  publicBaseUrl?: string | null;
  ruName?: string | null;
  encryptionReady: boolean;
  resolved: ResolvedEbayConfig;
  username: string | null;
  catalog: EbayCatalog;
  policiesOptedIn: boolean | null;
  policiesHint: string | null;
  catalogError: string | null;
  health: 'unknown' | 'ok' | 'error';
  healthMessage: string | null;
  autoSelected: Array<keyof EbaySelection>;
  now: Date;
}): EbaySetupView {
  const { resolved } = input;
  const environmentRaw = resolved.env.environment?.trim().toLowerCase() ?? '';
  const environmentInvalid = Boolean(environmentRaw) && environmentRaw !== 'production' && environmentRaw !== 'sandbox';
  const environment = environmentRaw === 'sandbox' ? 'sandbox' : 'production';
  const clientIdReady = ebayValueConfigured(resolved.env.clientId);
  const clientSecretReady = ebayValueConfigured(resolved.env.clientSecret);
  const ruNameReady = ebayValueConfigured(input.ruName);
  const expiresAt =
    resolved.connectionSource === 'database' && resolved.record?.refreshTokenExpiresAt
      ? resolved.record.refreshTokenExpiresAt
      : null;
  const refreshExpired = Boolean(expiresAt && expiresAt.getTime() <= input.now.getTime());
  const refreshExpiresSoon = Boolean(
    expiresAt && !refreshExpired && expiresAt.getTime() - input.now.getTime() <= SOON_MS,
  );
  const gaps = ebaySellGaps(resolved.env);
  const selection = resolved.selection;
  const callbackPath = '/api/system/ebay/callback';
  const base = (input.publicBaseUrl ?? '').trim().replace(/\/$/, '');
  const callbackUrl = base && /^https?:\/\//i.test(base) ? `${base}${callbackPath}` : callbackPath;
  return {
    environment,
    environmentInvalid,
    callbackUrl,
    clientIdReady,
    clientSecretReady,
    ruNameReady,
    encryptionReady: input.encryptionReady,
    oauthReady: clientIdReady && clientSecretReady && ruNameReady && input.encryptionReady,
    connected: resolved.connectionSource != null,
    connectionSource: resolved.connectionSource,
    username: cleanUsername(input.username),
    refreshExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    refreshExpired,
    refreshExpiresSoon,
    health: input.health,
    healthMessage: input.healthMessage,
    tokenUnreadable: resolved.tokenUnreadable,
    policiesOptedIn: input.policiesOptedIn,
    policiesHint: input.policiesHint,
    catalogError: input.catalogError,
    fulfillmentPolicies: withStoredPolicies(input.catalog.fulfillmentPolicies, selection.fulfillmentPolicyId),
    paymentPolicies: withStoredPolicies(input.catalog.paymentPolicies, selection.paymentPolicyId),
    returnPolicies: withStoredPolicies(input.catalog.returnPolicies, selection.returnPolicyId),
    locations: withStoredLocation(input.catalog.locations, selection.merchantLocationKey),
    selection,
    selectionSource: resolved.selectionSource,
    autoSelected: input.autoSelected,
    publishReady: gaps.length === 0 && !environmentInvalid,
    publishMissing: gaps.map((gap) => gap.message),
  };
}

export function assertKnownPolicy(id: string | null, options: EbayPolicyOption[], label: string): void {
  if (!id) return;
  if (!options.some((option) => option.id === id)) {
    throw new EbaySellException(`${label} gibt es bei diesem eBay-Konto nicht.`);
  }
}

export function assertKnownLocation(key: string | null, options: EbayLocationOption[]): void {
  if (!key) return;
  if (!options.some((option) => option.key === key)) {
    throw new EbaySellException('Diesen Lagerstandort gibt es bei diesem eBay-Konto nicht.');
  }
}

function pick(db: string | null | undefined, envValue: string | null | undefined): { value: string | null; source: EbayValueSource } {
  if (ebayValueConfigured(db)) return { value: db!.trim(), source: 'database' };
  if (ebayValueConfigured(envValue)) return { value: envValue!.trim(), source: 'environment' };
  return { value: null, source: null };
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanUsername(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

function emptyRecord(userId: string): EbayConnectionRecord {
  return {
    userId,
    refreshTokenCiphertext: null,
    refreshTokenExpiresAt: null,
    ebayUserId: null,
    ebayUsername: null,
    connectedAt: null,
    health: 'unknown',
    healthMessage: null,
    healthCheckedAt: null,
    fulfillmentPolicyId: null,
    paymentPolicyId: null,
    returnPolicyId: null,
    pickupFulfillmentPolicyId: null,
    merchantLocationKey: null,
  };
}
