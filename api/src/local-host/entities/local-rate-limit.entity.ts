import { Collection } from 'fireorm';

// id = steamId
@Collection()
export class LocalRateLimit {
  id: string;
  lastRequestAt: Date;
  lastRequestMatchId: string;
  dailyPointsDate?: Date;
  dailyPointsTotal?: number;
}
