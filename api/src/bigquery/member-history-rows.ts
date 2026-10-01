import { CreateMemberDto } from '../members/dto/create-member.dto';
import { MemberDto } from '../members/dto/member.dto';
import { Member } from '../members/entities/members.entity';

import { PointChangeSource } from './point-history-rows';

/** 一次开通或续费会员生成一行，写入前后的等级与到期日都留下，从未开过会员时写入前为空。 */
export function buildMemberHistoryRow(
  purchase: CreateMemberDto,
  before: Member | undefined,
  after: MemberDto,
  source: PointChangeSource,
  createdAt: Date,
): Record<string, unknown> {
  return {
    created_at: createdAt.toISOString(),
    steam_id: purchase.steamId,
    purchased_level: purchase.level,
    months: purchase.month,
    level_before: before?.level ?? null,
    expire_date_before: before ? before.expireDate.toISOString().split('T')[0] : null,
    level_after: after.level,
    expire_date_after: after.expireDateString,
    reason: source.reason,
    ref: source.ref ?? null,
  };
}
