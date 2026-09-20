import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { MarketplaceProjectionEntity } from './marketplace-projection.entity';

// Append-only Evidence-Log (Doc 02 §7, Doc 03 §8/§9). `isWinner` bleibt NULL
// bis zur Konfliktauflösung: NULL = unentschieden, TRUE = Sieger,
// FALSE = Verlierer (Storno nötig). UNIQUE(projectionId, externalEventId)
// ist die DB-Ebene der Webhook-Idempotenz (T05-2).
@Entity('sale_events')
export class SaleEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'projection_id' })
  projectionId: string;

  @ManyToOne(() => MarketplaceProjectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projection_id' })
  projection: MarketplaceProjectionEntity;

  @Column({ name: 'external_event_id' })
  externalEventId: string;

  @Column({
    name: 'reported_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  reportedPrice: number;

  @Column({ name: 'is_winner', type: 'boolean', nullable: true })
  isWinner: boolean | null;

  @Column({ name: 'cancellation_confirmed', type: 'boolean', default: false })
  cancellationConfirmed: boolean;

  // Bewusst kein @CreateDateColumn: der Ingestion-Service (Schritt 5) muss
  // hier den vom Webhook gemeldeten Zeitpunkt setzen können, nicht zwingend
  // den Zeitpunkt der DB-Insertion.
  @Column({ name: 'reported_at', type: 'timestamptz', default: () => 'now()' })
  reportedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
