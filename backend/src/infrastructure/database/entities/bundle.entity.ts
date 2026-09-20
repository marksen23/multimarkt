import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  BUNDLE_LIFECYCLE_STATES,
  BundleLifecycleState,
} from '../../../domain/state-vocabulary';
import { UserEntity } from './user.entity';

// BUNDLE ENGINE (Doc 01 §11): eigenständiges Dispositionsobjekt, keine
// Listing-Sonderform. `status` ausschließlich über StateGuardService (Schritt 3).
@Entity('bundles')
export class BundleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: BUNDLE_LIFECYCLE_STATES,
    enumName: 'bundle_lifecycle_state',
    default: 'NEW',
  })
  status: BundleLifecycleState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
