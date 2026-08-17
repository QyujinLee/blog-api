import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PostModule } from '../post/post.module';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';

@Module({
  imports: [PrismaModule, AuthModule, PostModule],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
