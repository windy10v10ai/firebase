import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

import { PropertyItem } from '../types/property-item.types';

@Collection()
export class PlayerProperty {
  @Exclude()
  id: string;
  steamId: number;
  properties: PropertyItem[] = [];
}
