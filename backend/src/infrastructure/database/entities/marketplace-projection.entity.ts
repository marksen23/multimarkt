import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PROJECTION_LIFECYCLE_STATES,
  ProjectionLifecycleState,
} from '../../../domain/state-vocabulary';
import { CanonicalListingEntity } from './canonical-listing.entity';

// Die plattformspezifische Formatierung und Status-Verwaltung (Doc 01 §3).
// `status` ausschließlich über StateGuardService (Schritt 3). `fallbackData`
// enthält plattformerzwungene Ersatzwerte (Doc 04.4) — diese Werte dürfen
// NIEMALS in ProductTruth (item_attributes) zurückgeschrieben werden.
@Entity('marketplace_projections')
export class MarketplaceProjectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'canonical_listing_id' })
  canonicalListingId: string;

  @ManyToOne(() => CanonicalListingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canonical_listing_id' })
  canonicalListing: CanonicalListingEntity;

  @Column({ name: 'marketplace_id' })
  marketplaceId: string;

  @Column({
    type: 'enum',
    enum: PROJECTION_LIFECYCLE_STATES,
    enumName: 'projection_lifecycle_state',
    default: 'DRAFT',
  })
  status: ProjectionLifecycleState;

  @Column({ name: 'external_platform_id', type: 'text', nullable: true })
  externalPlatformId: string | null;

  @Column({ name: 'fallback_data', type: 'jsonb', default: {} })
  fallbackData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
