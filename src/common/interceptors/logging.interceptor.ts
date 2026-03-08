import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = req;
    const userAgent = req.get('user-agent') ?? '';
    const userId = (req as any).user?.id ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const delay = Date.now() - start;
        this.logger.log(
          `${method} ${url} ${res.statusCode} ${delay}ms - ${ip} - userId:${userId} - ${userAgent}`,
        );
      }),
    );
  }
}
