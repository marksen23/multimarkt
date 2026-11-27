import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type EbayConnectionHealth = 'unknown' | 'ok' | 'error';

/** Eine Zeile, ein Verkäufer. Das Refresh-Token liegt nur verschlüsselt. */
@Entity('ebay_connections')
export class EbayConnectionEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ name: 'refresh_token_ciphertext', type: 'text', nullable: true })
  refreshTokenCiphertext: string | null;

  @Column({ name: 'refresh_token_expires_at', type: 'timestamptz', nullable: true })
  refreshTokenExpiresAt: Date | null;

  @Column({ name: 'ebay_user_id', type: 'text', nullable: true })
  ebayUserId: string | null;

  @Column({ name: 'ebay_username', type: 'text', nullable: true })
  ebayUsername: string | null;

  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'text', default: 'unknown' })
  health: EbayConnectionHealth;

  @Column({ name: 'health_message', type: 'text', nullable: true })
  healthMessage: string | null;

  @Column({ name: 'health_checked_at', type: 'timestamptz', nullable: true })
  healthCheckedAt: Date | null;

  @Column({ name: 'fulfillment_policy_id', type: 'text', nullable: true })
  fulfillmentPolicyId: string | null;

  @Column({ name: 'payment_policy_id', type: 'text', nullable: true })
  paymentPolicyId: string | null;

  @Column({ name: 'return_policy_id', type: 'text', nullable: true })
  returnPolicyId: string | null;

  @Column({ name: 'pickup_fulfillment_policy_id', type: 'text', nullable: true })
  pickupFulfillmentPolicyId: string | null;

  @Column({ name: 'merchant_location_key', type: 'text', nullable: true })
  merchantLocationKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
