import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import {
  ebayValueConfigured,
  readEbaySellEnv,
  type EbaySellEnv,
} from '../../domain/listing/ebay-sell-readiness';
import { createOauthState, ebayAuthorizeUrl, ebayCallbackUrl, verifyOauthState } from '../../marketplaces/ebay/ebay-oauth';
import { EbaySetupClient, type EbayLocationDraft } from '../../marketplaces/ebay/ebay-setup.client';
import {
  applySelectionPatch,
  assertKnownLocation,
  assertKnownPolicy,
  buildEbaySetupView,
  ebayLocationKey,
  planAutoSelection,
  resolveEbayConfig,
  type ResolvedEbayConfig,
} from '../../marketplaces/ebay/ebay-setup.logic';
import {
  EMPTY_EBAY_CATALOG,
  POLICIES_NOT_OPTED_IN_HINT,
  type EbayCatalog,
  type EbayConnectionRecord,
  type EbaySelection,
  type EbaySetupView,
} from '../../marketplaces/ebay/ebay-setup.types';
import { decryptEbayToken, ebayTokenSecret, encryptEbayToken, EbayTokenCipherError } from '../../marketplaces/ebay/ebay-token-cipher';
import { EbaySetupStore } from './ebay-setup.store';

const TOKEN_UNREADABLE = 'Das gespeicherte eBay-Token lässt sich nicht lesen. Verbinde das Konto neu.';

export interface EbaySelectionInput {
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  pickupFulfillmentPolicyId?: string | null;
  merchantLocationKey?: string | null;
}

export interface EbayLocationInput {
  name: string;
  street: string;
  postalCode: string;
  city: string;
}

/**
 * Eine Verbindung, ein Verkäufer. Die gespeicherte Zeile gewinnt vor den
 * Coolify-Variablen. Zugangstoken verlassen diese Klasse nicht.
 */
@Injectable()
export class EbaySetupService {
  private readonly logger = new Logger(EbaySetupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly store: EbaySetupStore,
    private readonly client: EbaySetupClient,
  ) {}

  async resolve(): Promise<EbaySellEnv> {
    return (await this.resolveDetailed()).env;
  }

  async beginConnect(): Promise<{ authorizeUrl: string }> {
    const creds = this.requireOauthConfig();
    const secret = this.requireSecret();
    const issued = createOauthState(secret);
    await this.store.putState(issued.hash, issued.expiresAt);
    return {
      authorizeUrl: ebayAuthorizeUrl({
        environment: creds.environment,
        clientId: creds.clientId,
        ruName: creds.ruName,
        state: issued.state,
      }),
    };
  }

  async completeCallback(input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
  }): Promise<string> {
    try {
      if (input.error) {
        return this.redirect(input.error === 'access_denied' ? 'ebay=fehler&grund=abgelehnt' : 'ebay=fehler&grund=unbekannt');
      }
      const code = input.code?.trim() ?? '';
      const state = input.state?.trim() ?? '';
      if (!code || !state) return this.redirect('ebay=fehler&grund=abgelaufen');
      const secret = this.tokenSecret();
      if (!secret) return this.redirect('ebay=fehler&grund=schluessel');
      const verified = verifyOauthState(state, secret, Date.now());
      if (!verified.ok) return this.redirect('ebay=fehler&grund=abgelaufen');
      const creds = this.readOauthConfig();
      if (!creds) return this.redirect('ebay=fehler&grund=schluessel');
      const consumed = await this.store.consumeState(verified.hash, new Date());
      if (!consumed) return this.redirect('ebay=fehler&grund=abgelaufen');

      const tokens = await this.client.exchangeCode(creds, code);
      if (!tokens.refreshToken) {
        throw new EbaySellException('eBay hat kein Refresh-Token geliefert. Die Verbindung kann nicht gespeichert werden.');
      }
      const identity = await this.client.identity(creds, tokens.accessToken);
      const previous = await this.store.getConnection(this.userId());
      const sameAccount =
        !previous?.ebayUserId || !identity?.userId || previous.ebayUserId === identity.userId;
      const patch: Partial<EbayConnectionRecord> = {
        refreshTokenCiphertext: encryptEbayToken(tokens.refreshToken, secret),
        refreshTokenExpiresAt: tokens.refreshExpiresIn
          ? new Date(Date.now() + tokens.refreshExpiresIn * 1000)
          : null,
        ebayUserId: identity?.userId ?? previous?.ebayUserId ?? null,
        ebayUsername: identity?.username ?? previous?.ebayUsername ?? null,
        connectedAt: new Date(),
        health: 'ok',
        healthMessage: null,
        healthCheckedAt: new Date(),
      };
      if (!sameAccount) {
        patch.fulfillmentPolicyId = null;
        patch.paymentPolicyId = null;
        patch.returnPolicyId = null;
        patch.pickupFulfillmentPolicyId = null;
        patch.merchantLocationKey = null;
      }
      await this.store.saveConnection(this.userId(), patch);
      return this.redirect('ebay=verbunden');
    } catch (error) {
      this.logger.warn(`eBay-Verbindung fehlgeschlagen: ${error instanceof Error ? error.name : 'error'}`);
      const grund = error instanceof EbaySellException ? 'austausch' : 'unbekannt';
      return this.redirect(`ebay=fehler&grund=${grund}`);
    }
  }

  async disconnect(): Promise<EbaySetupView> {
    await this.store.clearToken(this.userId());
    return this.status();
  }

  async saveSelection(input: EbaySelectionInput): Promise<EbaySetupView> {
    const resolved = await this.requireCallable();
    const loaded = await this.catalogOf(resolved);
    if (!loaded.optedIn) {
      throw new EbaySellException(loaded.hint ?? POLICIES_NOT_OPTED_IN_HINT);
    }
    const next: Partial<EbayConnectionRecord> = {
      fulfillmentPolicyId: blank(input.fulfillmentPolicyId),
      paymentPolicyId: blank(input.paymentPolicyId),
      returnPolicyId: blank(input.returnPolicyId),
      pickupFulfillmentPolicyId: blank(input.pickupFulfillmentPolicyId),
      merchantLocationKey: blank(input.merchantLocationKey),
    };
    assertKnownPolicy(next.fulfillmentPolicyId ?? null, loaded.catalog.fulfillmentPolicies, 'Die Versandrichtlinie');
    assertKnownPolicy(next.paymentPolicyId ?? null, loaded.catalog.paymentPolicies, 'Die Zahlungsrichtlinie');
    assertKnownPolicy(next.returnPolicyId ?? null, loaded.catalog.returnPolicies, 'Die Rückgaberichtlinie');
    assertKnownPolicy(
      next.pickupFulfillmentPolicyId ?? null,
      loaded.catalog.fulfillmentPolicies,
      'Die Abholrichtlinie',
    );
    assertKnownLocation(next.merchantLocationKey ?? null, loaded.catalog.locations);
    await this.store.saveConnection(this.userId(), next);
    return this.status();
  }

  async createLocation(input: EbayLocationInput): Promise<EbaySetupView> {
    const name = input.name?.trim() ?? '';
    const street = input.street?.trim() ?? '';
    const postalCode = input.postalCode?.trim() ?? '';
    const city = input.city?.trim() ?? '';
    if (!name || name.length > 40) {
      throw new EbaySellException('Der Standort braucht einen Namen mit höchstens 40 Zeichen.');
    }
    if (!street || street.length > 80) {
      throw new EbaySellException('Die Straße fehlt.');
    }
    if (!/^\d{5}$/.test(postalCode)) {
      throw new EbaySellException('Die Postleitzahl braucht fünf Ziffern.');
    }
    if (!city || city.length > 40) {
      throw new EbaySellException('Der Ort fehlt.');
    }
    const resolved = await this.requireCallable();
    const accessToken = await this.client.userAccessToken(resolved.env);
    const draft: EbayLocationDraft = {
      key: ebayLocationKey(name),
      name,
      street,
      postalCode,
      city,
      country: 'DE',
    };
    await this.client.createLocation(resolved.env, accessToken, draft);
    await this.store.saveConnection(this.userId(), { merchantLocationKey: draft.key });
    return this.status();
  }

  async status(): Promise<EbaySetupView> {
    let resolved = await this.resolveDetailed();
    const now = new Date();
    let username = resolved.record?.ebayUsername ?? null;
    let catalog: EbayCatalog = EMPTY_EBAY_CATALOG;
    let policiesOptedIn: boolean | null = null;
    let policiesHint: string | null = null;
    let catalogError: string | null = null;
    let autoSelected: Array<keyof EbaySelection> = [];
    let health: EbaySetupView['health'] = 'unknown';
    let healthMessage: string | null = null;

    if (resolved.tokenUnreadable && resolved.connectionSource == null) {
      health = 'error';
      healthMessage = TOKEN_UNREADABLE;
    }

    if (this.canCallEbay(resolved)) {
      let tokenOk = false;
      try {
        const accessToken = await this.client.userAccessToken(resolved.env);
        tokenOk = true;
        const identity = await this.client.identity(resolved.env, accessToken);
        if (identity?.username) username = identity.username;
        if (resolved.connectionSource === 'database') {
          await this.store.saveConnection(this.userId(), {
            health: 'ok',
            healthMessage: null,
            healthCheckedAt: now,
            ...(identity ? { ebayUserId: identity.userId, ebayUsername: identity.username } : {}),
          });
        }
        const loaded = await this.client.loadCatalog(resolved.env, accessToken);
        policiesOptedIn = loaded.optedIn;
        policiesHint = loaded.hint;
        catalog = loaded.catalog;
        health = 'ok';
        healthMessage = null;
        const plan = planAutoSelection(resolved, catalog);
        if (plan.fields.length > 0) {
          await this.store.saveConnection(this.userId(), plan.patch);
          resolved = applySelectionPatch(resolved, plan.patch);
          autoSelected = plan.fields;
        }
      } catch (error) {
        const message = ebayErrorText(error);
        const rejected = error instanceof EbaySellException && error.tokenRejected;
        if (rejected) {
          health = 'error';
          healthMessage = message;
          if (resolved.connectionSource === 'database') {
            await this.store.saveConnection(this.userId(), {
              health: 'error',
              healthMessage: message,
              healthCheckedAt: now,
            });
          }
        } else if (tokenOk) {
          health = 'ok';
          healthMessage = null;
          catalogError = message;
        } else {
          catalogError = message;
          health = 'unknown';
          healthMessage = null;
        }
      }
    }

    const view = buildEbaySetupView({
      publicBaseUrl: this.config.get<string>('PUBLIC_BASE_URL'),
      ruName: this.config.get<string>('EBAY_RU_NAME'),
      encryptionReady: Boolean(this.tokenSecret()),
      resolved,
      username,
      catalog,
      policiesOptedIn,
      policiesHint,
      catalogError,
      health,
      healthMessage,
      autoSelected,
      now,
    });
    this.assertViewHasNoSecrets(view, [
      resolved.env.refreshToken,
      resolved.env.clientSecret,
      resolved.record?.refreshTokenCiphertext,
    ]);
    return view;
  }

  private async resolveDetailed(): Promise<ResolvedEbayConfig> {
    const env = readEbaySellEnv(this.config);
    const record = await this.store.getConnection(this.userId());
    const secret = this.tokenSecret();
    let decryptedToken: string | null = null;
    let tokenUnreadable = false;
    if (record?.refreshTokenCiphertext) {
      if (!secret) {
        tokenUnreadable = true;
      } else {
        try {
          decryptedToken = decryptEbayToken(record.refreshTokenCiphertext, secret);
        } catch (error) {
          tokenUnreadable = true;
          decryptedToken = null;
          if (!(error instanceof EbayTokenCipherError)) {
            this.logger.warn('eBay-Token ließ sich nicht entschlüsseln.');
          }
        }
      }
    }
    return resolveEbayConfig({ env, record, decryptedToken, tokenUnreadable });
  }

  private async requireCallable(): Promise<ResolvedEbayConfig> {
    const resolved = await this.resolveDetailed();
    if (!this.canCallEbay(resolved)) {
      if (resolved.tokenUnreadable && resolved.connectionSource == null) {
        throw new EbaySellException(TOKEN_UNREADABLE);
      }
      throw new EbaySellException('Zuerst das eBay-Konto verbinden.');
    }
    return resolved;
  }

  private async catalogOf(resolved: ResolvedEbayConfig) {
    const accessToken = await this.client.userAccessToken(resolved.env);
    return this.client.loadCatalog(resolved.env, accessToken);
  }

  private canCallEbay(resolved: ResolvedEbayConfig): boolean {
    return (
      ebayValueConfigured(resolved.env.clientId) &&
      ebayValueConfigured(resolved.env.clientSecret) &&
      ebayValueConfigured(resolved.env.refreshToken)
    );
  }

  private requireOauthConfig(): { clientId: string; clientSecret: string; ruName: string; environment?: string } {
    const creds = this.readOauthConfig();
    if (!creds) {
      const callback = ebayCallbackUrl(this.config.get<string>('PUBLIC_BASE_URL'));
      throw new EbaySellException(
        `EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_RU_NAME fehlt in Coolify. Die angenommene Weiterleitungsadresse des RuName muss ${callback} sein.`,
      );
    }
    if (!this.tokenSecret()) {
      throw new EbaySellException(
        'JWT_SECRET oder EBAY_TOKEN_SECRET fehlt. Ohne diesen Schlüssel speichert die App das eBay-Zugangstoken nicht.',
      );
    }
    return creds;
  }

  private readOauthConfig(): { clientId: string; clientSecret: string; ruName: string; environment?: string } | null {
    const clientId = this.config.get<string>('EBAY_CLIENT_ID');
    const clientSecret = this.config.get<string>('EBAY_CLIENT_SECRET');
    const ruName = this.config.get<string>('EBAY_RU_NAME');
    if (!ebayValueConfigured(clientId) || !ebayValueConfigured(clientSecret) || !ebayValueConfigured(ruName)) {
      return null;
    }
    return {
      clientId: clientId!.trim(),
      clientSecret: clientSecret!.trim(),
      ruName: ruName!.trim(),
      environment: this.config.get<string>('EBAY_ENVIRONMENT'),
    };
  }

  private requireSecret(): string {
    const secret = this.tokenSecret();
    if (!secret) {
      throw new EbaySellException(
        'JWT_SECRET oder EBAY_TOKEN_SECRET fehlt. Ohne diesen Schlüssel speichert die App das eBay-Zugangstoken nicht.',
      );
    }
    return secret;
  }

  private tokenSecret(): string | null {
    return ebayTokenSecret(this.config);
  }

  private userId(): string {
    const id = this.config.get<string>('APP_USER_ID')?.trim();
    if (!id) {
      throw new EbaySellException('APP_USER_ID fehlt. Die eBay-Verbindung hängt an dem einen Nutzer.');
    }
    return id;
  }

  private redirect(query: string): string {
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').trim().replace(/\/$/, '');
    const path = `/einrichtung?${query}`;
    if (!base || !/^https?:\/\//i.test(base)) return path;
    return `${base}${path}`;
  }

  private assertViewHasNoSecrets(view: EbaySetupView, secrets: Array<string | null | undefined>): void {
    const serialized = JSON.stringify(view);
    for (const secret of secrets) {
      if (secret && secret.length >= 12 && serialized.includes(secret)) {
        this.logger.warn('eBay-Einrichtung hat ein Geheimnis aus der Antwort genommen.');
        throw new EbaySellException('Die Einrichtung kann gerade nicht angezeigt werden.');
      }
    }
  }
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export function ebayErrorText(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string') {
      return (body as { message: string }).message;
    }
  }
  if (error instanceof Error && error.message && error.name !== 'Error') return error.message;
  return 'eBay ist gerade nicht erreichbar.';
}
