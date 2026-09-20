import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeletionAuditLogEntity, UserEntity } from '../../infrastructure/database/entities';

/**
 * Hard-Delete-Lifecycle (Doc 01 §15, Doc 03 §15, Doc 04 §16 — T08-1).
 *
 * SCOPE-HINWEIS (siehe Abschlussbericht): implementiert den DB-Kaskaden-Teil
 * vollständig und beweisbar (T01-3). Der asynchrone S3-Garbage-Collector für
 * `MEDIA_DELETED` (Doc 01 §15 Schritt) ist NICHT Teil dieser Implementierung
 * — das erfordert echte S3-Credentials/Bucket-Struktur, die es in diesem
 * Projektstand noch nicht gibt. `mediaHardDeleted` bleibt deshalb bewusst
 * `false`, bis dieser Job (Schritt "Asynchrone Jobs") gebaut wird.
 */
@Injectable()
export class AccountDeletionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async requestDeletion(userId: string): Promise<DeletionAuditLogEntity> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOneBy(UserEntity, { id: userId });
      if (!user) throw new NotFoundException(`User ${userId} not found`);

      // Nicht rückrechenbarer Hash — Doc 01 §15 Punkt 3 verlangt einen
      // Audit-Eintrag OHNE Personenbezug.
      const anonymizedUserHash = createHash('sha256').update(user.id).digest('hex');

      await manager.remove(UserEntity, user); // ON DELETE CASCADE (T01-3)

      return manager.save(DeletionAuditLogEntity, {
        anonymizedUserHash,
        dbRecordsDeleted: true,
        mediaHardDeleted: false,
      });
    });
  }

  async getDeletionStatus(anonymizedUserHash: string): Promise<DeletionAuditLogEntity | null> {
    return this.dataSource.manager.findOneBy(DeletionAuditLogEntity, { anonymizedUserHash });
  }
}
