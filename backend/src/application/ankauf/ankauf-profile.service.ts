import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AnkaufResearchResult,
  AnkaufSearchProfile,
  AnkaufSearchSummary,
} from '../../domain/ankauf/ankauf.types';
import {
  ANKAUF_SEARCH_HISTORY_LIMIT,
  AnkaufSearchPlace,
  isAnkaufRadiusKm,
} from '../../domain/ankauf/search-place';
import {
  AnkaufSearchEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { AnkaufResearchService } from './ankauf-research.service';

/**
 * Feature-Plan 2.6. PLZ und Umkreis liegen am Nutzer. Jede Suche wird
 * kurz behalten, die ältesten fallen aus der Liste.
 */
@Injectable()
export class AnkaufProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly research: AnkaufResearchService,
  ) {}

  async getProfile(userId: string): Promise<AnkaufSearchProfile> {
    const user = await this.requireUser(userId);
    return this.toProfile(user);
  }

  async updateProfile(
    userId: string,
    input: { postalCode: string; radiusKm: number },
  ): Promise<AnkaufSearchProfile> {
    const place = this.assertPlace(input.postalCode, input.radiusKm);
    const user = await this.requireUser(userId);
    user.postalCode = place.postalCode;
    user.searchRadiusKm = place.radiusKm;
    await this.dataSource.manager.save(UserEntity, user);
    return this.toProfile(user);
  }

  async search(userId: string, keywords: string): Promise<AnkaufResearchResult> {
    const trimmed = keywords.trim();
    if (!trimmed) throw new BadRequestException('Der Suchbegriff fehlt.');

    const user = await this.requireUser(userId);
    if (!user.postalCode) {
      throw new BadRequestException('Lege zuerst eine PLZ im Suchprofil fest.');
    }
    const place = this.assertPlace(user.postalCode, user.searchRadiusKm);
    const result = await this.research.search(trimmed, place);
    await this.remember(userId, place, result);
    return result;
  }

  async list(userId: string): Promise<AnkaufSearchSummary[]> {
    const rows = await this.dataSource.manager.find(AnkaufSearchEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
      take: ANKAUF_SEARCH_HISTORY_LIMIT,
    });
    return rows.map((row) => this.toSummary(row));
  }

  async open(userId: string, id: string): Promise<AnkaufResearchResult> {
    const row = await this.dataSource.manager.findOne(AnkaufSearchEntity, {
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Diese Suche gibt es nicht mehr.');
    return row.result;
  }

  private async remember(
    userId: string,
    place: AnkaufSearchPlace,
    result: AnkaufResearchResult,
  ): Promise<void> {
    const manager = this.dataSource.manager;
    await manager.save(AnkaufSearchEntity, {
      userId,
      keywords: result.keywords,
      postalCode: place.postalCode,
      radiusKm: place.radiusKm,
      location: result.location,
      marketMedianEur: result.marketMedianEur,
      listingCount: result.listings.length,
      result,
    });
    const rows = await manager.find(AnkaufSearchEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    for (const stale of rows.slice(ANKAUF_SEARCH_HISTORY_LIMIT)) {
      await manager.delete(AnkaufSearchEntity, { id: stale.id });
    }
  }

  private assertPlace(postalCode: string, radiusKm: number): AnkaufSearchPlace {
    const trimmed = postalCode.trim();
    if (!/^\d{5}$/.test(trimmed)) {
      throw new BadRequestException('Die PLZ braucht fünf Ziffern.');
    }
    if (!isAnkaufRadiusKm(radiusKm)) {
      throw new BadRequestException('Dieser Umkreis ist nicht vorgesehen.');
    }
    return { postalCode: trimmed, radiusKm };
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.manager.findOneBy(UserEntity, { id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  private toProfile(user: UserEntity): AnkaufSearchProfile {
    return { postalCode: user.postalCode, radiusKm: user.searchRadiusKm };
  }

  private toSummary(row: AnkaufSearchEntity): AnkaufSearchSummary {
    return {
      id: row.id,
      keywords: row.keywords,
      postalCode: row.postalCode,
      radiusKm: row.radiusKm,
      location: row.location,
      marketMedianEur: row.marketMedianEur,
      listingCount: row.listingCount,
      searchedAt: row.createdAt.toISOString(),
    };
  }
}
