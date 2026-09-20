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
      useFactory: () => {
        // buildDataSourceOptions() liest process.env erst HIER, wenn Nest
        // die Factory tatsächlich aufruft (DI-Resolution-Zeit) — nicht beim
        // Modul-Import.
        const { migrations: _migrations, ...options } = buildDataSourceOptions();
        return {
          ...options,
          // BUGFIX (echter Produktions-Crash auf Render, September 2026):
          // `migrations: ['migrations/*.ts']` ist nur für die CLI gedacht
          // (läuft über `typeorm-ts-node-commonjs`, versteht .ts-Dateien).
          // Der laufende App-Prozess (kompiliertes dist/*.js, plain node,
          // kein ts-node registriert) lässt TypeORM beim `initialize()`
          // TROTZ `migrationsRun: false` die rohen .ts-Migrationsdateien
          // per require() laden (Metadaten-Aufbau, nicht nur beim
          // tatsächlichen Ausführen) — `implements` ist außerhalb von
          // TypeScript ein reserviertes Wort, das require() dann mit
          // "Unexpected strict mode reserved word" zum Absturz bringt
          // (Endlosschleife aus DB-Connect-Retries, App startet nie).
          // Die App führt Migrationen ohnehin nie selbst aus (siehe
          // migrationsRun: false + Doc 01 Strict Rule) — sie braucht die
          // Migrationsliste zur Laufzeit schlicht nicht.
          migrations: [],
          // explizite Entity-Liste aus dataSourceOptions PLUS autoLoadEntities
          // für Feature-Module, die künftig via TypeOrmModule.forFeature([...])
          // registriert werden (Schritt 3+).
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
