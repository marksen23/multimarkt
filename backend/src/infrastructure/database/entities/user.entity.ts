import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
