import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TRUTH_STATES, TruthState } from '../../../domain/state-vocabulary';
import { ItemEntity } from './item.entity';

// PROVENANCE: Detail-Attribute mit exaktem Herkunftsnachweis (Doc 01 §2).
// DB-Constraint `check_unknown_value` (siehe Migration) ist die unterste
// Verteidigungslinie für "Never silently invent" (Doc 04.2) — T01-2.
@Entity('item_attributes')
export class ItemAttributeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ name: 'attribute_key' })
  attributeKey: string;

  @Column({ name: 'attribute_value', type: 'text', nullable: true })
  attributeValue: string | null;

  @Column({
    name: 'truth_state',
    type: 'enum',
    enum: TRUTH_STATES,
    enumName: 'truth_state',
    default: 'UNKNOWN',
  })
  truthState: TruthState;

  @Column()
  source: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
