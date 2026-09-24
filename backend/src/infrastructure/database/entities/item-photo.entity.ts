import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ItemEntity } from './item.entity';

// FOTOGALERIE (September 2026): persistente Verknüpfung hochgeladener
// Fotos mit ihrem Item — vorher gab es nur transiente URLs für den
// KI-Analyse-Call, nirgends dauerhaft gespeichert.
@Entity('item_photos')
export class ItemPhotoEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ type: 'text' })
  url: string;

  // Für einen künftigen Hard-Delete-/S3-Garbage-Collector-Job
  // (StorageProvider.delete() braucht den Key, nicht die URL).
  @Column({ name: 'storage_key', type: 'text' })
  storageKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
