import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { CanonicalListingEntity } from './canonical-listing.entity';

// Ereignis „Preis geändert“ (Feature-Plan 3.6). Der bisherige Preis und
// der Vermerk „Preis am … gesenkt“ bleiben hier. Die Anzeige selbst wird
// dabei nicht umgeschrieben — `description_text` liegt nicht auf dieser Zeile.
@Entity('listing_price_changes')
export class ListingPriceChangeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'canonical_listing_id' })
  canonicalListingId: string;

  @ManyToOne(() => CanonicalListingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canonical_listing_id' })
  canonicalListing: CanonicalListingEntity;

  @Column({
    name: 'previous_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  previousPrice: number;

  @Column({
    name: 'new_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  newPrice: number;

  @Column({ type: 'text' })
  note: string;

  @Column({ name: 'follow_up_days', type: 'int' })
  followUpDays: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
