import { randomBytes } from 'crypto';

import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { ClientOrigin } from '../util/auth/client-origin.decorator';

import { CreateFeedbackDto, MAX_LOG_BYTES } from './dto/create-feedback.dto';
import { FeedbackQuota } from './entities/feedback-quota.entity';
import { FeedbackReport } from './entities/feedback-report.entity';
import { FeedbackLogStorageService } from './feedback-log-storage.service';

export const REPORTS_PER_HOUR = 3;
export const REPORTS_PER_DAY = 10;
// Steam ID 能伪造，换着 ID 刷也只能刷到这个数，存储费用有上限
export const SITE_REPORTS_PER_DAY = 500;
const RETENTION_DAYS = 90;
const QUOTA_RETENTION_DAYS = 2;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GZIP_MAGIC = [0x1f, 0x8b];

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(FeedbackReport)
    private readonly reportRepository: BaseFirestoreRepository<FeedbackReport>,
    @InjectRepository(FeedbackQuota)
    private readonly quotaRepository: BaseFirestoreRepository<FeedbackQuota>,
    private readonly logStorage: FeedbackLogStorageService,
  ) {}

  /** 收下一份反馈：校验、限频、存日志与报告。 */
  async create(dto: CreateFeedbackDto, origin: ClientOrigin): Promise<void> {
    const description = dto.description?.trim() ?? '';
    if (dto.type === 'suggestion' && !description) {
      throw new BadRequestException('description is required for suggestions');
    }
    const serverLog = decodeLog(dto.serverLog);
    const clientLog = decodeLog(dto.clientLog);

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    // 国内代理转发的请求共用代理的 IP，所以优先按 Steam ID 计
    const submitter = dto.steamId ? `steam-${dto.steamId}` : `ip-${origin.ip ?? 'unknown'}`;
    const siteQuotaId = `${day}_all`;
    const ownQuotaId = `${day}_${submitter}`;
    const [siteQuota, ownQuota] = await Promise.all([
      this.quotaRepository.findById(siteQuotaId),
      this.quotaRepository.findById(ownQuotaId),
    ]);
    if ((siteQuota?.count ?? 0) >= SITE_REPORTS_PER_DAY) {
      throw new HttpException('daily_limit_reached', HttpStatus.TOO_MANY_REQUESTS);
    }
    const recent = (ownQuota?.recent ?? []).filter((at) => at > now.getTime() - HOUR_MS);
    if ((ownQuota?.count ?? 0) >= REPORTS_PER_DAY || recent.length >= REPORTS_PER_HOUR) {
      throw new HttpException('too_many_reports', HttpStatus.TOO_MANY_REQUESTS);
    }

    const id = `${day.replace(/-/g, '')}-${randomBytes(4).toString('hex')}`;
    const [serverLogPath, clientLogPath] = await Promise.all([
      serverLog && this.logStorage.save(`${day}/${id}/server.log.gz`, serverLog),
      clientLog && this.logStorage.save(`${day}/${id}/client.log.gz`, clientLog),
    ]);

    await this.reportRepository.create({
      id,
      source: 'launcher',
      type: dto.type,
      topics: dto.topics,
      tags: [],
      description,
      ...(dto.steamId && { steamId: dto.steamId }),
      steamIdVerified: false,
      launcherVersion: dto.launcherVersion,
      ...(dto.mapVersion && { mapVersion: dto.mapVersion }),
      ...(dto.windowsVersion && { windowsVersion: dto.windowsVersion }),
      ...(dto.mode && { mode: dto.mode }),
      ...(dto.launcherError && { launcherError: { ...dto.launcherError } }),
      ...(serverLogPath && { serverLog: serverLogPath }),
      ...(clientLogPath && { clientLog: clientLogPath }),
      ...(origin.country && { country: origin.country }),
      createdAt: now,
      expireAt: new Date(now.getTime() + RETENTION_DAYS * DAY_MS),
    });

    const quotaExpireAt = new Date(now.getTime() + QUOTA_RETENTION_DAYS * DAY_MS);
    await Promise.all([
      this.saveQuota(siteQuotaId, siteQuota, [], quotaExpireAt),
      this.saveQuota(ownQuotaId, ownQuota, [...recent, now.getTime()], quotaExpireAt),
    ]);

    logger.info('feedback received', {
      id,
      type: dto.type,
      topics: dto.topics,
      steamId: dto.steamId,
      launcherVersion: dto.launcherVersion,
      hasServerLog: !!serverLog,
      hasClientLog: !!clientLog,
    });
  }

  private async saveQuota(
    id: string,
    existing: FeedbackQuota | null,
    recent: number[],
    expireAt: Date,
  ): Promise<void> {
    const quota = { id, count: (existing?.count ?? 0) + 1, recent, expireAt };
    if (existing) await this.quotaRepository.update(quota);
    else await this.quotaRepository.create(quota);
  }
}

function decodeLog(base64?: string): Buffer | undefined {
  if (!base64) return undefined;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_LOG_BYTES || bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) {
    throw new BadRequestException('log must be gzip, at most 1MB');
  }
  return bytes;
}
