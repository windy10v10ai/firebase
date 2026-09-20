import { SetMetadata } from '@nestjs/common';

export const ALLOW_LOCAL_KEY = 'allowLocal';
export const AllowLocal = () => SetMetadata(ALLOW_LOCAL_KEY, true);
