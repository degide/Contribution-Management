import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController, ContributionSummaryController } from './declarations.controller';
import { Declaration } from './entities/declaration.entity';
import { ContributionLine } from './entities/contribution-line.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Employer } from '../employers/entities/employer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Declaration, ContributionLine, Employee, Employer])],
  controllers: [DeclarationsController, ContributionSummaryController],
  providers: [DeclarationsService],
})
export class DeclarationsModule {}
