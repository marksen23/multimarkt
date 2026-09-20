import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PRICE_RESEARCH_SOURCES, PriceResearchSource } from '../../../domain/pricing/price-research-vocabulary';
import { numericTransformer } from '../transformers/numeric.transformer';
import { ItemEntity } from './item.entity';

// PREIS-VORSCHLAGS-CACHE (docs/README.md §9e). Bewusst KEIN ProductTruth-
// Attribut und kein `truth_state`: ein rein beratender, jederzeit neu
// abrufbarer Vorschlag, der nie automatisch in `items.condition` oder
// `item_attributes` übernommen wird (§9d Punkt 6: "keine Automatik ohne
// Bestätigung"). Jede Quelle bekommt ihre eigene Zeile — nie vermischt
// (§9d Punkt 3: Quellen-Kennzeichnung ist Pflicht).
@Entity('item_price_research')
export class ItemPriceResearchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({
    type: 'enum',
    enum: PRICE_RESEARCH_SOURCES,
    enumName: 'price_research_source',
  })
  source: PriceResearchSource;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  median: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  p25: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  p75: number | null;

  @Column({ name: 'sample_size', type: 'int' })
  sampleSize: number;

  @Column({ type: 'text', default: 'EUR' })
  currency: string;

  @Column({ name: 'provider_label', type: 'text' })
  providerLabel: string;

  // Audit-Trail der Rohantwort (z.B. Ankaufspreis + verwendeter
  // Umrechnungsfaktor) — nicht fürs Frontend gedacht, siehe Service.
  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}
