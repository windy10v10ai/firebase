import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SteamVerifyDto {
  // 原样透传整个查询串，而不是拆成字段：OpenID 的签名覆盖的是参数的原始取值，
  // 拆开再拼回去有改变取值的风险
  @ApiProperty({
    description: 'Steam 回调地址上的查询串，含开头的 ?',
    example: '?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res',
  })
  @IsString()
  @IsNotEmpty()
  openidParams!: string;
}
