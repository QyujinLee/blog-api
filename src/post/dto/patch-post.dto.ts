import { IsBoolean, IsOptional } from 'class-validator';

export class PatchPostDto {
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
