import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { ItemEntity } from './item.entity';
import { UserEntity } from './user.entity';

type MarkdownPlanStatus = 'INHERIT' | 'ACTIVE' | 'PAUSED' | 'STOPPED';

/** Plan je Artikel. Fehlende Zeile heißt: Vorgabe aus dem Konto. */
@Entity('item_markdown_plans')
export class ItemMarkdownPlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id', unique: true })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'text', default: 'INHERIT' })
  status: MarkdownPlanStatus;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  percent: number | null;

  @Column({ name: 'interval_days', type: 'int', nullable: true })
  intervalDays: number | null;

  @Column({
    name: 'floor_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  floorPrice: number | null;

  @Column({ name: 'last_applied_at', type: 'timestamptz', nullable: true })
  lastAppliedAt: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
