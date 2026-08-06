import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 3000은 프론트(Next.js dev)가 쓰므로 로컬 기본값은 4000.
  // Render는 PORT를 주입하므로 배포 환경에선 그 값을 따름
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
