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
  point20240927?: boolean;
  fourthAnniversary?: boolean;
  newYear2025?: boolean;
  lunarNewYear2025?: boolean;
}
