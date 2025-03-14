import { Collection } from 'fireorm';

@Collection()
export class PlayerRank {
  id: string; // YYYYMMDD
  rankSteamIds: string[];
}
