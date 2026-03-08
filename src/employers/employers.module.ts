import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployersService } from './employers.service';
import { EmployersController } from './employers.controller';
import { Employer } from './entities/employer.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Employer, User])],
  controllers: [EmployersController],
  providers: [EmployersService],
  exports: [EmployersService],
})
export class EmployersModule {}
