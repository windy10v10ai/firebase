import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowWeb } from '../util/auth/allow-web.decorator';
import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { Public } from '../util/auth/public.decorator';
import { CurrentViewerUid } from '../util/auth/server-type.decorator';

import { CreateFeedbackDto, CreateWebFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // 启动器 exe 里放不了秘密，滥用靠按人与全站的次数上限挡
  @Public()
  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Report a problem or suggest an idea, optionally with game logs' })
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<void> {
    await this.feedbackService.create(dto, origin);
  }

  @AllowWeb()
  @Post('web')
  @HttpCode(204)
  @ApiOperation({ summary: 'Report a problem or suggest an idea as the signed-in website player' })
  async createFromWeb(
    @Body() dto: CreateWebFeedbackDto,
    @CurrentViewerUid() uid: string | undefined,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<void> {
    // 游戏服务器的 key 也能通过 guard，只有带登录态的网页请求才有 uid
    if (!uid) {
      throw new UnauthorizedException();
    }
    await this.feedbackService.create(
      { ...dto, source: 'web', steamId: Number(uid) },
      origin,
      true,
    );
  }
}
