import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Einmal-Zustand für den eBay-OAuth-Callback. Gespeichert wird nur der Hash. */
@Entity('ebay_oauth_states')
export class EbayOauthStateEntity {
  @PrimaryColumn({ name: 'state_hash', type: 'varchar', length: 64 })
  stateHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
