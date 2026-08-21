import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { R2Service } from './r2.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Controller('images')
export class ImageController {
  constructor(private readonly r2Service: R2Service) {}

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp|gif)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    // 확장자는 클라이언트가 보낸 파일명이 아니라 검증된 mimetype에서 파생 — 파일명은 신뢰하지 않음
    const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];
    const key = `images/${randomUUID()}.${extension}`;
    const url = await this.r2Service.upload(key, file.buffer, file.mimetype);

    return { url };
  }
}
