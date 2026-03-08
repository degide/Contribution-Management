import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, AuthResponseDto, RegisterAdminDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from './decorators/roles.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: '[Admin] Create an additional admin account',
    description:
      'Creates a new admin user. ' +
      'To onboard an employer, use `POST /employers` instead. ' +
      'That endpoint creates the employer record and login credentials atomically.',
  })
  @ApiResponse({ status: 201, description: 'Admin account created', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  registerAdmin(@Body() dto: RegisterAdminDto): Promise<AuthResponseDto> {
    return this.authService.registerAdmin(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login and receive JWT token' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }
}
