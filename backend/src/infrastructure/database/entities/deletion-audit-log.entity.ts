import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Überlebt bewusst den ON DELETE CASCADE des Users (Doc 01 §5, Doc 03 §15):
// enthält KEINE personen- oder objektbezogenen Daten mehr, nur einen nicht
// rückrechenbaren Hash als Compliance-Nachweis für den Hard-Delete (T08-1).
@Entity('deletion_audit_logs')
export class DeletionAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'anonymized_user_hash' })
  anonymizedUserHash: string;

  @Column({ name: 'media_hard_deleted', type: 'boolean', default: false })
  mediaHardDeleted: boolean;

  @Column({ name: 'db_records_deleted', type: 'boolean', default: false })
  dbRecordsDeleted: boolean;

  @Column({
    name: 'deletion_completed_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  deletionCompletedAt: Date;
}
