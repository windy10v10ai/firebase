import { Collection } from 'fireorm';

@Collection()
export class KofiUser {
  id: string;
  email: string;
  fromName: string;
  steamId: number;
  createdAt: Date;
  updatedAt: Date;
}
