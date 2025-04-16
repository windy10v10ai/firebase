import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

@ApiTags('Test')
@Controller('test')
export class TestController {

}
