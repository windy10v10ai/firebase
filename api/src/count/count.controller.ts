import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CountService } from './count.service';

@ApiTags('Count')
@Controller('count')
export class CountController {
  constructor(private readonly countService: CountService) {}
}
