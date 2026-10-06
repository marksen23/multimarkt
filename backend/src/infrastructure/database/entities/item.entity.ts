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
import { numericTransformer } from '../transformers/numeric.transformer';
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

  // Einstand (Feature-Plan 3.3): der konkrete Einkauf, nicht die
  // bestätigte Produktwahrheit. `condition` oben bleibt das Mensch-Tor
  // fürs Listing; der Zustand des Einkaufs steht daneben.
  @Column({
    name: 'purchase_price_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  purchasePriceEur: number | null;

  @Column({ name: 'purchase_portal', type: 'text', nullable: true })
  purchasePortal: string | null;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column({ name: 'purchase_condition', type: 'text', nullable: true })
  purchaseCondition: string | null;

  @Column({ name: 'purchase_url', type: 'text', nullable: true })
  purchaseUrl: string | null;

  // Verkaufsabschluss (Feature-Plan 3.4). Die Beträge sind der erfasste
  // Verkauf, nicht die erwartete Marge. `salePurchasePriceEur` ist der
  // Einstand in diesem Moment; `saleNetProfitEur` ist Netto minus diesen
  // Einstand. Beides bleibt stehen, wenn der Einkauf später geändert wird.
  @Column({
    name: 'sale_proceeds_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  saleProceedsEur: number | null;

  @Column({ name: 'sale_portal', type: 'text', nullable: true })
  salePortal: string | null;

  @Column({
    name: 'sale_fee_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  saleFeeEur: number | null;

  @Column({
    name: 'sale_shipping_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  saleShippingEur: number | null;

  @Column({ name: 'sale_payment_method', type: 'text', nullable: true })
  salePaymentMethod: string | null;

  @Column({
    name: 'sale_purchase_price_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  salePurchasePriceEur: number | null;

  @Column({
    name: 'sale_net_profit_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  saleNetProfitEur: number | null;

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
