import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // HttpException의 response는 string 또는 { message, error } 형태(ValidationPipe가 던지는 BadRequestException 포함)
    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as { message?: unknown })?.message ??
          '서버 오류가 발생했습니다.');

    if (!isHttpException) {
      // 예상 못한 에러만 스택까지 로그 — HttpException은 의도된 4xx라 노이즈라 제외
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const path = String(httpAdapter.getRequestUrl(ctx.getRequest()));

    const responseBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path,
      message,
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
