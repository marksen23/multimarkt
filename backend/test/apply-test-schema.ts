import { QueryRunner } from 'typeorm';
import { AddChannelCards1793000000000 } from '../migrations/1793000000000-AddChannelCards';
import { InitialSchema1789894285515 } from '../migrations/1789894285515-InitialSchema';

/** Schema für Integrationstests: eingefrorene Basis plus Kanal-Karten. */
export async function applyTestSchema(queryRunner: QueryRunner): Promise<void> {
  await new InitialSchema1789894285515().up(queryRunner);
  await new AddChannelCards1793000000000().up(queryRunner);
}
