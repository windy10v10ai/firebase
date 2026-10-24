import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LauncherReleaseDto {
  @ApiPropertyOptional({ enum: ['macos'] })
  platform?: 'macos';
  @ApiProperty({ description: '最新版启动器的版本号' })
  version: string;
  @ApiProperty({ description: '最新版启动器 exe 的 SHA-256，小写十六进制' })
  sha256: string;
}
