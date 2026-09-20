import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BundleEntity } from './bundle.entity';
import { ItemEntity } from './item.entity';

// Mapping-Tabelle (Doc 01 §11): garantiert 1:n Zuordnung ohne Item-Duplikation.
// `item_id` ist ON DELETE RESTRICT — ein Item kann nicht gelöscht werden,
// solange es noch einem Bundle zugeordnet ist.
@Entity('bundle_items')
export class BundleItemEntity {
  @PrimaryColumn({ name: 'bundle_id' })
  bundleId: string;

  @PrimaryColumn({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => BundleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle: BundleEntity;

  @ManyToOne(() => ItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;
}
