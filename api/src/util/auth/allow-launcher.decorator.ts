import { SetMetadata } from '@nestjs/common';

export const ALLOW_LAUNCHER_KEY = 'allowLauncher';
export const AllowLauncher = () => SetMetadata(ALLOW_LAUNCHER_KEY, true);
