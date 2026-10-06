import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';

// Verworfene Bundle-Vorschläge (Feature-Plan 3.8). Der Fingerabdruck ist
// Dimension + Attributtext + Artikelmenge. Ein neuer Artikel ergibt einen
// neuen Vorschlag. Angenommene Pakete brauchen keine Zeile: die Artikel
// verlassen READY.
@Entity('bundle_suggestion_dismissals')
@Unique('uq_bundle_suggestion_dismissal', ['userId', 'fingerprint'])
export class BundleSuggestionDismissalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'text' })
  fingerprint: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
