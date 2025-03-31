import { Collection } from 'fireorm';

@Collection()
export class KofiUser {
  id: string;
  email: string;
  steamId: number;
  createdAt: Date;
  updatedAt: Date;
}
