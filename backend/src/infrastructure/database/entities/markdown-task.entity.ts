import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { ItemEntity } from './item.entity';
import { MarketplaceProjectionEntity } from './marketplace-projection.entity';
import { UserEntity } from './user.entity';

type MarkdownTaskStatus = 'OPEN' | 'DONE' | 'DISMISSED' | 'SUPERSEDED';
type MarkdownTaskKind = 'MANUAL_PRICE' | 'EBAY_ERROR';

/**
 * Aufgabe, die der Verkäufer selbst erledigt: Preis auf einem Portal ohne
 * Schnittstelle senken, oder eine eBay-Fehlermeldung lesen.
 */
@Entity('markdown_tasks')
export class MarkdownTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'projection_id', type: 'uuid', nullable: true })
  projectionId: string | null;

  @ManyToOne(() => MarketplaceProjectionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'projection_id' })
  projection: MarketplaceProjectionEntity | null;

  @Column({ name: 'marketplace_id', type: 'text' })
  marketplaceId: string;

  @Column({
    name: 'target_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  targetPrice: number;

  @Column({
    name: 'previous_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  previousPrice: number;

  @Column({ type: 'text', default: 'OPEN' })
  status: MarkdownTaskStatus;

  @Column({ type: 'text' })
  kind: MarkdownTaskKind;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ name: 'copy_text', type: 'text' })
  copyText: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
