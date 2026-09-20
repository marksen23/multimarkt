import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;
}

@Entity('items')
export class ItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  title: string;
}

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

  @Column({ name: 'attribute_value', nullable: true })
  attributeValue: string | null;

  @Column({ name: 'truth_state' })
  truthState: string;

  @Column()
  source: string;
}

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
  status: string;

  @Column()
  title: string;
}

@Entity('canonical_listings')
export class CanonicalListingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'item_id', nullable: true })
  itemId: string | null;

  @Column({ name: 'bundle_id', nullable: true })
  bundleId: string | null;

  @Column({ type: 'numeric', name: 'selling_price' })
  sellingPrice: number;

  @Column({ type: 'text', name: 'description_text' })
  descriptionText: string;
}