import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { EbayConnectionEntity, EbayOauthStateEntity } from '../../infrastructure/database/entities';
import type { EbayConnectionRecord } from '../../marketplaces/ebay/ebay-setup.types';

export abstract class EbaySetupStore {
  abstract getConnection(userId: string): Promise<EbayConnectionRecord | null>;
  abstract saveConnection(userId: string, patch: Partial<EbayConnectionRecord>): Promise<EbayConnectionRecord>;
  abstract clearToken(userId: string): Promise<void>;
  abstract putState(hash: string, expiresAt: Date): Promise<void>;
  abstract consumeState(hash: string, now: Date): Promise<boolean>;
}

@Injectable()
export class TypeOrmEbaySetupStore extends EbaySetupStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getConnection(userId: string): Promise<EbayConnectionRecord | null> {
    const row = await this.dataSource.manager.findOneBy(EbayConnectionEntity, { userId });
    return row ? toRecord(row) : null;
  }

  async saveConnection(userId: string, patch: Partial<EbayConnectionRecord>): Promise<EbayConnectionRecord> {
    if (patch.refreshTokenCiphertext && !patch.refreshTokenCiphertext.startsWith('v1.')) {
      throw new Error('Refusing to store an unencrypted eBay token.');
    }
    const manager = this.dataSource.manager;
    const existing = await manager.findOneBy(EbayConnectionEntity, { userId });
    const row =
      existing ??
      manager.create(EbayConnectionEntity, {
        userId,
        health: 'unknown',
      });
    assignPatch(row, patch);
    row.userId = userId;
    return toRecord(await manager.save(row));
  }

  async clearToken(userId: string): Promise<void> {
    const existing = await this.getConnection(userId);
    if (!existing) return;
    await this.saveConnection(userId, {
      refreshTokenCiphertext: null,
      refreshTokenExpiresAt: null,
      ebayUserId: null,
      ebayUsername: null,
      connectedAt: null,
      health: 'unknown',
      healthMessage: null,
      healthCheckedAt: null,
    });
  }

  async putState(hash: string, expiresAt: Date): Promise<void> {
    const manager = this.dataSource.manager;
    await manager.delete(EbayOauthStateEntity, { expiresAt: LessThan(new Date()) });
    await manager.save(manager.create(EbayOauthStateEntity, { stateHash: hash, expiresAt }));
  }

  async consumeState(hash: string, now: Date): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(EbayOauthStateEntity, {
        where: { stateHash: hash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) return false;
      await manager.delete(EbayOauthStateEntity, { stateHash: hash });
      return row.expiresAt.getTime() >= now.getTime();
    });
  }
}

function assignPatch(row: EbayConnectionEntity, patch: Partial<EbayConnectionRecord>): void {
  const entries = Object.entries(patch) as Array<[keyof EbayConnectionRecord, EbayConnectionRecord[keyof EbayConnectionRecord]]>;
  for (const [key, value] of entries) {
    if (key === 'userId' || value === undefined) continue;
    (row as unknown as Record<string, unknown>)[key] = value;
  }
}

function toRecord(row: EbayConnectionEntity): EbayConnectionRecord {
  return {
    userId: row.userId,
    refreshTokenCiphertext: row.refreshTokenCiphertext,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    ebayUserId: row.ebayUserId,
    ebayUsername: row.ebayUsername,
    connectedAt: row.connectedAt,
    health: row.health,
    healthMessage: row.healthMessage,
    healthCheckedAt: row.healthCheckedAt,
    fulfillmentPolicyId: row.fulfillmentPolicyId,
    paymentPolicyId: row.paymentPolicyId,
    returnPolicyId: row.returnPolicyId,
    pickupFulfillmentPolicyId: row.pickupFulfillmentPolicyId,
    merchantLocationKey: row.merchantLocationKey,
  };
}
