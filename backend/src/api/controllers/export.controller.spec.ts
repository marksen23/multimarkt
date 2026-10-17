import { StreamableFile } from '@nestjs/common';
import { BackupExportService } from '../../application/export/backup-export.service';
import { ExportController } from './export.controller';

describe('ExportController', () => {
  it('sends the backup as a file download', async () => {
    const backup = {
      file: jest.fn(async () => ({
        filename: 'sicherung-2026-10-06.json',
        body: '{"articles":[]}',
      })),
    };
    const controller = new ExportController(
      backup as unknown as BackupExportService,
    );
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
    };

    const file = await controller.download(
      { type: 'USER', userId: 'user-1' },
      res as never,
    );

    expect(headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="sicherung-2026-10-06.json"',
    );
    expect(file).toBeInstanceOf(StreamableFile);
    expect(backup.file).toHaveBeenCalledWith('user-1');
  });
});
