import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class LoginDto {
  @ApiProperty({ example: 'admin@rssb.rw' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin1234!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterAdminDto {
  @ApiProperty({ example: 'newadmin@rssb.rw' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    role: UserRole;
    employerId?: string;
  };
}
