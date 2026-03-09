import { Module } from '@nestjs/common';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployersModule } from './employers/employers.module';
import { EmployeesModule } from './employees/employees.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/interceptors/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';

@Module({
  imports: [
    // Database
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? '',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME ?? '',
        autoLoadEntities: true,
        // Use auto migrations in production, sync in dev only
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development',
        // Connection pool settings
        poolSize: parseInt(process.env.DB_POOL_SIZE ?? '20', 10),
        poolErrorHandler: (err) => {
          console.error('Database connection error:', err);
        },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
          },
        ],
      }),
    }),

    AuthModule,
    UsersModule,
    EmployersModule,
    EmployeesModule,
    DeclarationsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Apply rate limiting globally
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (auditService: AuditService, dataSource: DataSource) =>
        new AuditInterceptor(auditService, dataSource),
      inject: [AuditService, getDataSourceToken()],
    },
  ],
})
export class AppModule {}
