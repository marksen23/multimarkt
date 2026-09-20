import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source';

// STRICT RULE (Doc 01 / Implementation Bootstrap): synchronize=false and
// migrationsRun=false, immer. Schema-Änderungen laufen ausschließlich über
// explizite SQL-Migrationen (`npm run migration:run`), nie über TypeORM-Auto-Sync
// und nie implizit beim App-Start.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        // buildDataSourceOptions() liest process.env erst HIER, wenn Nest
        // die Factory tatsächlich aufruft (DI-Resolution-Zeit) — nicht beim
        // Modul-Import.
        ...buildDataSourceOptions(),
        // explizite Entity-Liste aus dataSourceOptions PLUS autoLoadEntities
        // für Feature-Module, die künftig via TypeOrmModule.forFeature([...])
        // registriert werden (Schritt 3+).
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
