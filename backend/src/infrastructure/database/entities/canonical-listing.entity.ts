import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { BundleEntity } from './bundle.entity';
import { ItemEntity } from './item.entity';
import { UserEntity } from './user.entity';

// Die plattformneutrale Verkaufsdarstellung (Doc 01 §3, Doc 04.1 "Bundle-XOR").
// INVARIANTE: gehört immer entweder zu genau einem Item ODER genau einem
// Bundle — durchgesetzt per DB CHECK `check_item_or_bundle_listing` (T01-1).
// Diese Entity erlaubt beide Felder auf TS-Ebene bewusst als nullable; die
// XOR-Regel wird NICHT im Anwendungscode nachgebildet, sondern bleibt
// alleinige Verantwortung der Datenbank.
@Entity('canonical_listings')
export class CanonicalListingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'item_id', nullable: true })
  itemId: string | null;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity | null;

  @Column({ name: 'bundle_id', nullable: true })
  bundleId: string | null;

  @ManyToOne(() => BundleEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'bundle_id' })
  bundle: BundleEntity | null;

  @Column({
    name: 'selling_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  sellingPrice: number;

  @Column({ name: 'description_text', type: 'text' })
  descriptionText: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
