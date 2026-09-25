import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AccountDeletionService } from './account-deletion.service';

function makeManager(user: { id: string } | null): EntityManager {
  return {
    findOneBy: jest.fn().mockResolvedValue(user),
    remove: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
  } as unknown as EntityManager;
}

function makeDataSource(manager: EntityManager): DataSource {
  return {
    transaction: (fn: (m: EntityManager) => unknown) => fn(manager),
    manager,
  } as unknown as DataSource;
}

describe('AccountDeletionService', () => {
  const UserEntityMatcher = expect.anything();

  it('throws NotFoundException when the user does not exist', async () => {
    const service = new AccountDeletionService(makeDataSource(makeManager(null)));

    await expect(service.requestDeletion('missing-user')).rejects.toThrow(NotFoundException);
  });

  it('removes the user and writes an audit log with a deterministic, non-reversible hash instead of the raw user id', async () => {
    const manager = makeManager({ id: 'user-1' });
    const service = new AccountDeletionService(makeDataSource(manager));
    const expectedHash = createHash('sha256').update('user-1').digest('hex');

    const result = await service.requestDeletion('user-1');

    expect(manager.remove).toHaveBeenCalledWith(UserEntityMatcher, { id: 'user-1' });
    expect(result.anonymizedUserHash).toBe(expectedHash);
    expect(result.anonymizedUserHash).not.toContain('user-1');
    expect(result.dbRecordsDeleted).toBe(true);
  });

  it('never claims media was hard-deleted — the S3 garbage collector is not built yet (honesty, not a bug)', async () => {
    const manager = makeManager({ id: 'user-2' });
    const service = new AccountDeletionService(makeDataSource(manager));

    const result = await service.requestDeletion('user-2');

    expect(result.mediaHardDeleted).toBe(false);
  });

  it('getDeletionStatus looks up by the anonymized hash, not by user id', async () => {
    const manager = makeManager(null);
    const dataSource = makeDataSource(manager);
    const service = new AccountDeletionService(dataSource);

    await service.getDeletionStatus('some-hash');

    expect(manager.findOneBy).toHaveBeenCalledWith(expect.anything(), { anonymizedUserHash: 'some-hash' });
  });
});
