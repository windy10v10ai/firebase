import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';

import { AuthService } from './auth.service';
import { SteamVerifyDto } from './dto/steam-verify.dto';

@Public()
@ApiTags('Auth(Public)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 用 Steam 回调参数换取 Firebase Custom Token */
  @Post('steam/verify')
  async verifySteam(@Body() dto: SteamVerifyDto) {
    return this.authService.verifySteamCallback(dto.openidParams);
  }
}
