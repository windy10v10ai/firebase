import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty } from 'class-validator';

export enum ConductType {
  Commend = 'commend',
  Report = 'report',
}

export class ConductPlayerDto {
  @ApiProperty({ example: 123456789 })
  @IsInt()
  fromSteamId: number;

  @ApiProperty({ example: 123456789 })
  @IsInt()
  toSteamId: number;

  @ApiProperty({ enum: ConductType })
  @IsNotEmpty()
  @IsEnum(ConductType)
  type: ConductType;
}
