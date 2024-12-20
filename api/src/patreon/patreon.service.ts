import { Injectable } from '@nestjs/common';

import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

@Injectable()
export class PatreonService {
  constructor(
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
  ) {}

  async processPatreonOrder() {
    // TODO
  }
}
