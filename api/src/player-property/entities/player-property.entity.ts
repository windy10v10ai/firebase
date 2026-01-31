import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

/**
 * @deprecated 此 Entity 将在未来版本中移除，请使用 PlayerPropertyV2 替代
 */
@Collection()
export class PlayerProperty {
  @Exclude()
  id: string;
  steamId: number;
  name: string;
  level: number;
}
