import { Collection } from 'fireorm';

@Collection()
export class EventReward {
  id!: string;
  steamId!: number;
  thridAnniversary?: boolean;
  newYear2024?: boolean;
  subscription50000?: boolean;
  mayDay2024?: boolean;
  member20240716?: boolean;
}
