import type { PlatformType } from '../../types/platform';

export interface ManualActiveFormValues {
  platformOrderKey: string;
  steamId: string;
}

export type ManualActiveFormErrors = Partial<Record<keyof ManualActiveFormValues, true>>;

const STEAM_ID_PATTERN = /^\d{1,10}$/;
const AFDIAN_ORDER_PATTERN = /^\d{24,30}$/;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const validateManualActiveForm = (
  values: ManualActiveFormValues,
  activeType: PlatformType,
): ManualActiveFormErrors => {
  const errors: ManualActiveFormErrors = {};

  if (!STEAM_ID_PATTERN.test(values.steamId)) {
    errors.steamId = true;
  }

  const platformOrderKeyValid =
    activeType === 'afdian'
      ? AFDIAN_ORDER_PATTERN.test(values.platformOrderKey)
      : values.platformOrderKey.length >= 6 &&
        values.platformOrderKey.length <= 64 &&
        EMAIL_PATTERN.test(values.platformOrderKey);

  if (!platformOrderKeyValid) {
    errors.platformOrderKey = true;
  }

  return errors;
};
