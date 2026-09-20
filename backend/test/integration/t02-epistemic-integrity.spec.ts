import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AiAnalysisResult, AiVisionProvider } from '../../src/domain/ai/ai-vision-provider.interface';
import {
  HumanGateBypassException,
  UnconfirmedConditionException,
} from '../../src/domain/errors/state-transition.errors';
import { CapabilityCheckService } from '../../src/application/capability-check/capability-check.service';
import { ProductAnalysisService } from '../../src/application/product-analysis/product-analysis.service';
import { StateGuardService } from '../../src/application/state-guard/state-guard.service';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
  UserEntity,
} from '../../src/infrastructure/database/entities';
import { InitialSchema1789894285515 } from '../../migrations/1789894285515-InitialSchema';

/**
 * T02 Epistemic & ProductTruth Integrity (Doc 03 / Doc 04 — Doc 05 §3).
 *
 * "Adversarial Verification": ein bösartiger/fehlerhafter AI-Provider, der
 * versucht, einen Claim als bereits `USER_CONFIRMED` auszugeben (per `as
 * any`, weil unser eigener Typ `AiAttributeClaim` das Feld gar nicht
 * vorsieht), darf trotzdem niemals einen `USER_CONFIRMED`-Datensatz
 * erzeugen — die Provenienz wird ausschließlich vom Backend selbst
 * vergeben, nie aus der Payload übernommen (T02-1).
 */
describe('T02 Epistemic Integrity', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let stateGuard: StateGuardService;
  let userId: string;
  let itemId: string;

  class SpoofingAiProvider implements AiVisionProvider {
    async analyzeItem(): Promise<AiAnalysisResult> {
      return {
        modelId: 'malicious-provider',
        promptVersion: 'n/a',
        attributes: [
          // Versucht, Provenienz selbst zu bestimmen — unser Typ kennt dieses
          // Feld nicht, ein realer TS-Aufrufer könnte es nicht einmal
          // kompilieren. `as any` simuliert eine kompromittierte/fremde
          // Provider-Implementierung, die den Vertrag zur Laufzeit ignoriert.
          {
            key: 'brand',
            value: 'Nike',
            confidence: 0.99,
            truthState: 'USER_CONFIRMED',
          } as unknown as { key: string; value: string | null; confidence: number },
        ],
      };
    }
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [
        UserEntity,
        ItemEntity,
        ItemAttributeEntity,
        BundleEntity,
        CanonicalListingEntity,
        MarketplaceProjectionEntity,
        SaleEventEntity,
      ],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    await new InitialSchema1789894285515().up(queryRunner);
    await queryRunner.release();

    stateGuard = new StateGuardService(dataSource);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    const user = await dataSource.manager.save(UserEntity, {
      email: `t02-${Date.now()}-${Math.random()}@test.com`,
    });
    userId = user.id;
    const item = await dataSource.manager.save(ItemEntity, { userId, status: 'ANALYZING' });
    itemId = item.id;
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  describe('T02-1 (AI Spoofing Attempt)', () => {
    it('never persists USER_CONFIRMED from the AI ingestion pathway, even if the provider tries to claim it', async () => {
      const service = new ProductAnalysisService(dataSource, stateGuard, new SpoofingAiProvider());

      await service.analyze(itemId, ['https://example.com/photo.jpg'], { type: 'SYSTEM' });

      const brandAttr = await dataSource.manager.findOneByOrFail(ItemAttributeEntity, {
        itemId,
        attributeKey: 'brand',
      });
      expect(brandAttr.truthState).toBe('INFERRED');
      expect(brandAttr.truthState).not.toBe('USER_CONFIRMED');
      expect(brandAttr.attributeValue).toBe('Nike');
    });

    it('rejects a SYSTEM (AI-service-equivalent) actor calling confirm-truth directly (HTTP 403 equivalent)', async () => {
      await stateGuard.transitionItem(itemId, {
        type: 'AI_ANALYSIS_COMPLETE',
        actor: { type: 'SYSTEM' },
      });

      await expect(
        stateGuard.transitionItem(itemId, {
          type: 'CONFIRM_TRUTH',
          actor: { type: 'SYSTEM' },
          condition: 'good',
        }),
      ).rejects.toThrow(HumanGateBypassException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: itemId });
      expect(reloaded.status).toBe('REVIEW_REQUIRED');
      expect(reloaded.condition).toBeNull();
    });
  });

  describe('T02-2 (Premature Publication)', () => {
    it('blocks capability-check/publish with HTTP 422 while the item condition is UNKNOWN', async () => {
      // Item ist READY, aber condition wurde (aus welchem Grund auch immer)
      // nie gesetzt — CapabilityCheckService ist die zweite, unabhängige
      // Verteidigungslinie gegen genau diesen Fall (Defense-in-Depth zu
      // Schritt 3s READY-Precondition).
      await dataSource.manager.update(ItemEntity, { id: itemId }, { status: 'READY', condition: null });
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId,
        sellingPrice: 20,
        descriptionText: 'Unconfirmed condition listing',
      });

      const capabilityCheck = new CapabilityCheckService(dataSource);
      await expect(capabilityCheck.check(listing.id, 'EBAY')).rejects.toThrow(
        UnconfirmedConditionException,
      );
    });
  });
});
