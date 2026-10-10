import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { FeedbackRateLimit } from './entities/feedback-rate-limit.entity';
import { FeedbackReport } from './entities/feedback-report.entity';
import { FeedbackLogStorageService } from './feedback-log-storage.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [FireormModule.forFeature([FeedbackReport, FeedbackRateLimit])],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackLogStorageService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
