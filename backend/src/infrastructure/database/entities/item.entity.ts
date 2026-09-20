import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ITEM_LIFECYCLE_STATES, ItemLifecycleState } from '../../../domain/state-vocabulary';
import { UserEntity } from './user.entity';

// PRODUCT TRUTH: der physische Gegenstand (Doc 01 §2, Doc 02 §4).
// `status` darf NIEMALS per direktem UPDATE gesetzt werden — jede Änderung
// läuft ausschließlich über den StateGuardService (Schritt 3).
@Entity('items')
export class ItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({
    type: 'enum',
    enum: ITEM_LIFECYCLE_STATES,
    enumName: 'item_lifecycle_state',
    default: 'NEW',
  })
  status: ItemLifecycleState;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  // Rechtlich bindender Zustand (Neu/Wie neu/Gut/...). Die Provenienz dieses
  // Werts (INFERRED vs. USER_CONFIRMED) wird als item_attributes-Eintrag mit
  // attribute_key='condition' geführt, nicht auf dieser Spalte selbst.
  @Column({ type: 'text', nullable: true })
  condition: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
