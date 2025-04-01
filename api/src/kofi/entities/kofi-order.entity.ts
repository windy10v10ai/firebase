import { Collection } from 'fireorm';

import { KofiType } from '../enums/kofi-type.enum';
import { KofiShipping, KofiShopItem } from '../types/kofi.types';

@Collection()
export class KofiOrder {
  id: string;
  messageId: string;
  timestamp: Date;
  type: KofiType;
  isPublic: boolean;
  fromName: string;
  message: string;
  amount: number;
  url: string;
  email: string;
  currency: string;
  isSubscriptionPayment: boolean;
  isFirstSubscriptionPayment: boolean;
  kofiTransactionId: string;
  shopItems: KofiShopItem[] | null;
  tierName: string | null;
  shipping: KofiShipping | null;
  steamId: number;
  success: boolean;
  createdAt: Date;
  updatedAt: Date;
}
