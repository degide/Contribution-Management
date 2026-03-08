import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployersService } from './employers.service';
import { EmployersController } from './employers.controller';
import { Employer } from './entities/employer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Employer])],
  controllers: [EmployersController],
  providers: [EmployersService],
  exports: [EmployersService],
})
export class EmployersModule {}
