import 'dotenv/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 필드는 조용히 제거
      forbidNonWhitelisted: true, // DTO에 없는 필드가 오면 400으로 거부
      transform: true, // 요청 payload를 DTO 클래스 인스턴스로 변환
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("gyujin's log API")
    .setDescription('개인 블로그 백엔드 API')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  // 3000은 프론트(Next.js dev)가 쓰므로 로컬 기본값은 4000.
  // Render는 PORT를 주입하므로 배포 환경에선 그 값을 따름
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
