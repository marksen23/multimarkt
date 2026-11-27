import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { EbaySetupService } from '../../application/ebay/ebay-setup.service';
import type { EbaySetupView } from '../../marketplaces/ebay/ebay-setup.types';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { EbayLocationDto, EbaySelectionDto } from '../dto/ebay-setup.dto';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/**
 * Einrichtung des einen eBay-Kontos. Der Callback ist absichtlich ohne
 * Zugangstoken: eBay leitet den Browser hierher, der signierte Zustand
 * ersetzt das Bearer-Token.
 */
@Controller('system/ebay')
export class EbaySetupController {
  constructor(private readonly ebay: EbaySetupService) {}

  @Get()
  @UseGuards(ActorContextGuard)
  @UseInterceptors(ResponseEnvelopeInterceptor)
  status(): Promise<EbaySetupView> {
    return this.ebay.status();
  }

  @Post('connect')
  @UseGuards(ActorContextGuard)
  @UseInterceptors(ResponseEnvelopeInterceptor)
  connect(): Promise<{ authorizeUrl: string }> {
    return this.ebay.beginConnect();
  }

  @Post('disconnect')
  @UseGuards(ActorContextGuard)
  @UseInterceptors(ResponseEnvelopeInterceptor)
  disconnect(): Promise<EbaySetupView> {
    return this.ebay.disconnect();
  }

  @Patch('selection')
  @UseGuards(ActorContextGuard)
  @UseInterceptors(ResponseEnvelopeInterceptor)
  selection(@Body() dto: EbaySelectionDto): Promise<EbaySetupView> {
    return this.ebay.saveSelection(dto);
  }

  @Post('location')
  @UseGuards(ActorContextGuard)
  @UseInterceptors(ResponseEnvelopeInterceptor)
  location(@Body() dto: EbayLocationDto): Promise<EbaySetupView> {
    return this.ebay.createLocation(dto);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | string[] | undefined,
    @Query('state') state: string | string[] | undefined,
    @Query('error') error: string | string[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.ebay.completeCallback({
      code: firstQuery(code),
      state: firstQuery(state),
      error: firstQuery(error),
    });
    res.redirect(target);
  }
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
