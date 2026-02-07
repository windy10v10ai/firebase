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
  online800?: boolean;
  online900?: boolean;
  online1000?: boolean;
  mayDay2025?: boolean;
  online1200?: boolean;
  subscription100k?: boolean;
  point20250928?: boolean;
  point20251118?: boolean; // 网络故障补偿积分
  fiveYearAnniversary?: boolean; // 5周年庆典
  newYear2026?: boolean;
  lunarNewYear2026?: boolean;
}
