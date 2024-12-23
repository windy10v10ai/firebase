import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Player Count')
@Controller('player-count')
export class PlayerCountController {
  constructor() {}
}
