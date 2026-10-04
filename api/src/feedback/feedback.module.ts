import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { FeedbackQuota } from './entities/feedback-quota.entity';
import { FeedbackReport } from './entities/feedback-report.entity';
import { FeedbackLogStorageService } from './feedback-log-storage.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [FireormModule.forFeature([FeedbackReport, FeedbackQuota])],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackLogStorageService],
})
export class FeedbackModule {}
