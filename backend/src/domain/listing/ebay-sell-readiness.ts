const PLACEHOLDER = 'unused-mock-provider-active';

function isConfigured(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== PLACEHOLDER;
}

/**
 * Ein Verkäufer, eine Umgebung. Die Sell-API braucht ein User-Token
 * (Refresh Token) und die Geschäftsrichtlinien. App-ID und Cert-ID der
 * Browse-Suche reichen zum Einstellen nicht.
 */
export interface EbaySellEnv {
  clientId?: string | null;
  clientSecret?: string | null;
  refreshToken?: string | null;
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  merchantLocationKey?: string | null;
  pickupFulfillmentPolicyId?: string | null;
  /** Leer heißt Production (`api.ebay.com`). `sandbox` nur mit Sandbox-Token. */
  environment?: string | null;
}

export interface EbaySellGap {
  key: string;
  message: string;
}

const ENVIRONMENT_VALUES = new Set(['production', 'sandbox']);

export function ebayApiHost(environment: string | null | undefined): string {
  return environment?.trim().toLowerCase() === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
}

export function ebaySellGaps(env: EbaySellEnv, options?: { pickupOnly?: boolean }): EbaySellGap[] {
  const gaps: EbaySellGap[] = [];
  const missing = (key: string, message: string, value: string | null | undefined) => {
    if (!isConfigured(value)) gaps.push({ key, message });
  };

  missing(
    'EBAY_CLIENT_ID',
    'EBAY_CLIENT_ID fehlt. Production App ID (Client ID) unter https://developer.ebay.com/my/keys, Keyset Production.',
    env.clientId,
  );
  missing(
    'EBAY_CLIENT_SECRET',
    'EBAY_CLIENT_SECRET fehlt. Dieselbe Keyset-Seite, Feld Cert ID (Client Secret).',
    env.clientSecret,
  );
  missing(
    'EBAY_REFRESH_TOKEN',
    'EBAY_REFRESH_TOKEN fehlt. Das ist das OAuth-Refresh-Token deines eBay-Verkäuferkontos, nicht der App-Schlüssel der Preissuche. In der eBay Developer Console ein User Token mit den Scopes https://api.ebay.com/oauth/api_scope/sell.inventory und https://api.ebay.com/oauth/api_scope/sell.account anlegen (Authorization Code). Für ebay.de ein Production-Token. Sandbox nur zusammen mit EBAY_ENVIRONMENT=sandbox.',
    env.refreshToken,
  );
  missing(
    'EBAY_FULFILLMENT_POLICY_ID',
    'EBAY_FULFILLMENT_POLICY_ID fehlt. Geschäftsrichtlinie „Versand“ im Verkäufer-Cockpit. Die Richtlinien-ID steht in der Konto-API oder in der URL der Richtlinie.',
    env.fulfillmentPolicyId,
  );
  missing(
    'EBAY_PAYMENT_POLICY_ID',
    'EBAY_PAYMENT_POLICY_ID fehlt. Geschäftsrichtlinie „Zahlung“ im Verkäufer-Cockpit. eBay verlangt die ID beim Angebot.',
    env.paymentPolicyId,
  );
  missing(
    'EBAY_RETURN_POLICY_ID',
    'EBAY_RETURN_POLICY_ID fehlt. Geschäftsrichtlinie „Rückgabe“ im Verkäufer-Cockpit. Auch „keine Rückgabe“ ist eine Richtlinie mit eigener ID.',
    env.returnPolicyId,
  );
  missing(
    'EBAY_MERCHANT_LOCATION_KEY',
    'EBAY_MERCHANT_LOCATION_KEY fehlt. Lagerstandort im Verkäuferkonto (Inventory Location). Bei Abholung ist das der Abholort. Der Schlüssel ist der Name, den du beim Anlegen vergeben hast.',
    env.merchantLocationKey,
  );

  if (options?.pickupOnly) {
    missing(
      'EBAY_PICKUP_FULFILLMENT_POLICY_ID',
      'Der Artikel ist nur zur Abholung. EBAY_PICKUP_FULFILLMENT_POLICY_ID fehlt: eine Versandrichtlinie mit Abholung vor Ort, nicht die Richtlinie für den Paketversand.',
      env.pickupFulfillmentPolicyId,
    );
  }

  const environment = env.environment?.trim().toLowerCase() ?? '';
  if (environment && !ENVIRONMENT_VALUES.has(environment)) {
    gaps.push({
      key: 'EBAY_ENVIRONMENT',
      message: 'EBAY_ENVIRONMENT muss leer (Production), production oder sandbox sein.',
    });
  }

  return gaps;
}

export function fulfillmentPolicyId(env: EbaySellEnv, pickupOnly: boolean): string {
  if (pickupOnly) return env.pickupFulfillmentPolicyId?.trim() ?? '';
  return env.fulfillmentPolicyId?.trim() ?? '';
}
