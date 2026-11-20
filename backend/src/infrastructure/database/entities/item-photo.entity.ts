import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EnhancementStatus, PhotoTip } from '../../../domain/photo/photo-enhancement.types';
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

  // Foto-Briefing: welche Aufnahme das ist. Null, solange nicht zugeordnet.
  // Kein Pflichtfeld — fehlende Aufnahmen blockieren das Speichern nicht.
  @Column({ type: 'text', nullable: true })
  shot: string | null;

  // Original bleibt in url/storage_key. Die verbesserte Datei ist zusätzlich.
  @Column({ name: 'enhanced_url', type: 'text', nullable: true })
  enhancedUrl: string | null;

  @Column({ name: 'enhanced_storage_key', type: 'text', nullable: true })
  enhancedStorageKey: string | null;

  // pending | processing | ready | failed | skipped. Bestehende Fotos
  // bleiben skipped, neue Uploads setzt der Controller auf pending.
  @Column({ name: 'enhancement_status', type: 'text', default: 'skipped' })
  enhancementStatus: EnhancementStatus;

  @Column({ name: 'enhancement_error', type: 'text', nullable: true })
  enhancementError: string | null;

  @Column({ name: 'prefer_enhanced', type: 'boolean', default: true })
  preferEnhanced: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tips: PhotoTip[];

  @Column({ name: 'cover_score', type: 'double precision', nullable: true })
  coverScore: number | null;

  @Column({ name: 'suggested_cover', type: 'boolean', default: false })
  suggestedCover: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
