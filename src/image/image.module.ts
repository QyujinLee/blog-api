import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageController } from './image.controller';
import { R2Service } from './r2.service';

@Module({
  imports: [AuthModule],
  controllers: [ImageController],
  providers: [R2Service],
})
export class ImageModule {}
