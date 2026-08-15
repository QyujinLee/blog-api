import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsString()
  @MinLength(1)
  googleId!: string;
}
