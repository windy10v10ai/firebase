import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

import { HeroAwakeningItem } from '../types/hero-awakening-item.types';

export interface RandomHeroAwakeningCandidates {
  candidates: string[];
  createdAt: Date;
}

@Collection()
export class PlayerHeroAwakening {
  @Exclude()
  id: string;
  steamId: number;
  awakenings: HeroAwakeningItem[] = [];
  randomCandidates?: RandomHeroAwakeningCandidates;
}
