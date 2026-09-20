import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { ReportSaleDto } from '../dto/sale-events.dto';
import { ReportSaleOutcome, SaleIngestionService } from '../../application/sale-conflict/sale-ingestion.service';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/**
 * Doc 04 §11: `POST /sale-events` — "(Internal API) Legt eine Behauptung
 * (Evidence) an." Bewusst OHNE `ActorContextGuard`/User-Bearer-Auth: in
 * Produktion läuft dieser Pfad ausschließlich intern (Webhook-Controller
 * ruft `SaleIngestionService` direkt auf, siehe WebhooksController) bzw.
 * über ein geschlossenes Netzwerk (Doc 03 §18). Diese Route existiert für
 * Vertragstreue zu Doc 04 und manuelle/Debug-Zwecke.
 */
@Controller('sale-events')
@UseInterceptors(ResponseEnvelopeInterceptor)
export class SaleEventsController {
  constructor(private readonly saleIngestion: SaleIngestionService) {}

  @Post()
  async report(@Body() dto: ReportSaleDto): Promise<{ outcome: ReportSaleOutcome }> {
    const outcome = await this.saleIngestion.reportSale(dto);
    return { outcome };
  }
}
