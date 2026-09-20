import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Single-User-Architektur (kein Multi-Tenant/Workspace-Modell) — diese
// Tabelle existiert primär als Kaskaden-Wurzel für den Hard-Delete-Vertrag
// (Doc 01 §15 / Doc 03 §15).
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
