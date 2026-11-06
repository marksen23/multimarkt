import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DEFAULT_ANKAUF_RADIUS_KM } from '../../../domain/ankauf/search-place';
import { numericTransformer } from '../transformers/numeric.transformer';

// Single-User-Architektur (kein Multi-Tenant/Workspace-Modell) — diese
// Tabelle existiert primär als Kaskaden-Wurzel für den Hard-Delete-Vertrag
// (Doc 01 §15 / Doc 03 §15).
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // Annahmen für die erwartete Marge (Feature-Plan 3.3). Eine Zeile, ein
  // Nutzer: Gebühr als Prozentsatz, Versandpauschale, Schwelle unter der
  // ein Artikel nicht einzeln verkauft werden soll.
  @Column({
    name: 'fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  feePercent: number;

  @Column({
    name: 'shipping_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  shippingEur: number;

  @Column({
    name: 'single_sale_threshold_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  singleSaleThresholdEur: number | null;

  // Gebührenannahmen je Kanal (Feature-Plan 3.10). Keine Tarife.
  // Kleinanzeigen 0 €, eBay-Provision, Vinted-Käuferschutz.
  @Column({
    name: 'kleinanzeigen_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  kleinanzeigenFeePercent: number;

  @Column({
    name: 'kleinanzeigen_fee_fixed_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  kleinanzeigenFeeFixedEur: number;

  @Column({
    name: 'ebay_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 11,
    transformer: numericTransformer,
  })
  ebayFeePercent: number;

  @Column({
    name: 'ebay_fee_fixed_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  ebayFeeFixedEur: number;

  @Column({
    name: 'vinted_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 5,
    transformer: numericTransformer,
  })
  vintedFeePercent: number;

  @Column({
    name: 'vinted_fee_fixed_eur',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0.7,
    transformer: numericTransformer,
  })
  vintedFeeFixedEur: number;

  // Suchprofil der Ankauf-Recherche (Feature-Plan 2.6).
  @Column({ name: 'postal_code', type: 'varchar', length: 5, nullable: true })
  postalCode: string | null;

  @Column({ name: 'search_radius_km', type: 'int', default: DEFAULT_ANKAUF_RADIUS_KM })
  searchRadiusKm: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
