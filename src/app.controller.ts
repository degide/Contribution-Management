import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Common')
@Controller()
export class AppController {
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiOperation({ description: 'Returns 200 OK if the service is running' })
  @HttpCode(HttpStatus.OK)
  @Get('healthz')
  @SkipThrottle()
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
