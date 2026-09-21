import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// `/` gehört jetzt der ausgelieferten Frontend-SPA (siehe main.ts,
// Single-Domain-Merge September 2026) — der Health-Check lebt deshalb
// unter /healthz statt /, sonst würde diese Route ihn verdecken.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('healthz')
  getHello(): string {
    return this.appService.getHello();
  }
}
