import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const logger = new Logger('Bootstrap');

  // Global prefix
  app.setGlobalPrefix('api');

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter for consistent error shape
  app.useGlobalFilters(new AllExceptionsFilter());

  // Serialize responses (respects @Exclude decorators)
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Security headers
  app.use(helmet());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Employer Contribution Management API')
    .setDescription(
      `
  Manages employer registration, employee declaration, and monthly contribution submissions.
  
  ### Roles
  - **admin**: Full access to all resources
  - **employer**: Scoped to their own employer record, employees, and declarations
  
  ### Contribution Rates
  | Type | Rate |
  |------|------|
  | Pension | 6% |
  | Medical Insurance | 7.5% |
  | Maternity Leave | 0.3% |
  | **Total** | **13.8%** |
  
  ### Seed Credentials
  - Admin: **admin@rssb.rw** / **Admin1234!**
  
  - Employer: **employer@kigalitea.rw** / **Employer1234!**
    `.trim(),
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Common', 'Common utility endpoints')
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Employers', 'Employer management')
    .addTag('Employees', 'Employee registration')
    .addTag('Declarations', 'Monthly contribution declarations')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  logger.log(`Contribution API running at: http://localhost:${port}/api`);
  logger.log(`Swagger docs available at:        http://localhost:${port}/api/docs`);
}

bootstrap();
