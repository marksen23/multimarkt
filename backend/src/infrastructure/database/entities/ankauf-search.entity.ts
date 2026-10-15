import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { AnkaufResearchResult } from '../../../domain/ankauf/ankauf.types';
import { numericTransformer } from '../transformers/numeric.transformer';
import { UserEntity } from './user.entity';

// Eine gespeicherte Ankauf-Suche (Feature-Plan 2.6). Der Treffersatz liegt
// als Schnappschuss dabei, damit die Suche wieder geöffnet werden kann,
// ohne die Quelle noch einmal zu fragen. Die Historie bleibt kurz.
@Entity('ankauf_searches')
@Index('idx_ankauf_searches_user_created', ['userId', 'createdAt'])
export class AnkaufSearchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'text' })
  keywords: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 5 })
  postalCode: string;

  @Column({ name: 'radius_km', type: 'int' })
  radiusKm: number;

  @Column({ type: 'text' })
  location: string;

  @Column({
    name: 'market_median_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  marketMedianEur: number | null;

  @Column({ name: 'listing_count', type: 'int' })
  listingCount: number;

  @Column({ type: 'jsonb' })
  result: AnkaufResearchResult;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
