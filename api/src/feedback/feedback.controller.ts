import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { Public } from '../util/auth/public.decorator';

import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

// 启动器 exe 里放不了秘密，滥用靠按人与全站的次数上限挡
@Public()
@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Report a problem or suggest an idea, optionally with game logs' })
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<void> {
    await this.feedbackService.create(dto, origin);
  }
}
