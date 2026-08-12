import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 최초 기동 시(그리고 재배포 때마다) OWNER_EMAIL/OWNER_PASSWORD_HASH 환경변수로 소유자 계정을 upsert.
// 비밀번호는 평문이 아니라 이미 해시된 값을 환경변수로 받음(직접 bcrypt.hash 안 함).
@Injectable()
export class OwnerSeedService implements OnModuleInit {
  private readonly logger = new Logger(OwnerSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.OWNER_EMAIL;
    const passwordHash = process.env.OWNER_PASSWORD_HASH;

    if (!email || !passwordHash) {
      this.logger.warn(
        'OWNER_EMAIL/OWNER_PASSWORD_HASH이 설정되지 않아 OWNER 계정 시드를 건너뜁니다.',
      );
      return;
    }

    await this.prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: 'OWNER' },
      create: { email, name: 'gyujin', role: 'OWNER', passwordHash },
    });

    this.logger.log(`OWNER 계정 시드 완료: ${email}`);
  }
}
