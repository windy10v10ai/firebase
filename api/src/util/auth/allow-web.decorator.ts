import { SetMetadata } from '@nestjs/common';

export const ALLOW_WEB_KEY = 'allowWeb';
export const AllowWeb = () => SetMetadata(ALLOW_WEB_KEY, true);
