import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RevalidateModule } from '../revalidate/revalidate.module';
import { RedisModule } from '../redis/redis.module';
import { PostController } from './post.controller';
import { TagController } from './tag.controller';
import { PostService } from './post.service';

@Module({
  imports: [PrismaModule, AuthModule, RevalidateModule, RedisModule],
  controllers: [PostController, TagController],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
