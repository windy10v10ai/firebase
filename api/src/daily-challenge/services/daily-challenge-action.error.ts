import { ConflictException } from '@nestjs/common';

export type DailyChallengeActionErrorCode =
  | 'already_selected'
  | 'day_closed'
  | 'insufficient_member_points'
  | 'invalid_candidate'
  | 'not_member'
  | 'refresh_limit_reached';

export function dailyChallengeConflict(
  code: DailyChallengeActionErrorCode,
  message: string,
): ConflictException {
  return new ConflictException({ code, message });
}
