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
import { ItemEntity } from './item.entity';

type PriceHistorySource = 'AUTOMATIC' | 'MANUAL_CONFIRM';

/** Preisverlauf eines Artikels. Das Nachfassen liegt weiter in listing_price_changes. */
@Entity('item_price_history')
export class ItemPriceHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ name: 'canonical_listing_id', type: 'uuid', nullable: true })
  canonicalListingId: string | null;

  @ManyToOne(() => CanonicalListingEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'canonical_listing_id' })
  canonicalListing: CanonicalListingEntity | null;

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
  source: PriceHistorySource;

  @Column({ name: 'marketplace_id', type: 'text', nullable: true })
  marketplaceId: string | null;

  @Column({ type: 'text' })
  note: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
