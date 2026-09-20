import { Controller, INestApplication, Module, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { memoryStorage } from 'multer';
import request from 'supertest';

/**
 * Beweist die generische multipart/form-data-Mechanik (FilesInterceptor +
 * memoryStorage + @UploadedFiles()), die ItemsController.analyze() exakt so
 * verwendet — isoliert von der DB, damit sie ohne Testcontainers/Docker in
 * dieser Sandbox tatsächlich AUSGEFÜHRT statt nur typgeprüft werden kann.
 * Deckt genau das ab, was `LocalDiskStorageProvider`s eigene Unit-Tests
 * NICHT abdecken: dass ein echter HTTP-multipart-Request korrekt bis zum
 * Controller durchkommt.
 */
@Controller('probe')
class UploadProbeController {
  @Post('photos')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  receive(@UploadedFiles() files: Express.Multer.File[]) {
    return {
      count: files?.length ?? 0,
      files: (files ?? []).map((f) => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        bufferIsBuffer: Buffer.isBuffer(f.buffer),
      })),
    };
  }
}

@Module({ controllers: [UploadProbeController] })
class UploadProbeModule {}

describe('Photo upload mechanism (FilesInterceptor + memoryStorage)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [UploadProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('parses a real multipart request and hands the buffer to the controller', async () => {
    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const res = await request(app.getHttpServer())
      .post('/probe/photos')
      .attach('files', fakeJpegBytes, { filename: 'sneaker.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.count).toBe(1);
    expect(res.body.files[0]).toMatchObject({
      originalname: 'sneaker.jpg',
      mimetype: 'image/jpeg',
      size: fakeJpegBytes.length,
      bufferIsBuffer: true,
    });
  });

  it('accepts multiple files in one request (matches the "mehrere Fotos" flow)', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/photos')
      .attach('files', Buffer.from([1, 2, 3]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('files', Buffer.from([4, 5, 6]), { filename: 'b.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.count).toBe(2);
  });

  it('rejects an oversized file per the configured limit', async () => {
    const tooBig = Buffer.alloc(15 * 1024 * 1024 + 1);
    await request(app.getHttpServer())
      .post('/probe/photos')
      .attach('files', tooBig, { filename: 'huge.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });
});
