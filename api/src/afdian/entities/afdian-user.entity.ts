import { Collection } from 'fireorm';

@Collection()
export class AfdianUser {
  id: string;
  userId: string;
  steamId: number;
}
