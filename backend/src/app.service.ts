import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Personal Resale OS V2 — backend running.';
  }
}
