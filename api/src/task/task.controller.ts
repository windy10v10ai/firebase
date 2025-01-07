import { Controller } from '@nestjs/common';

import { AfdianService } from '../afdian/afdian.service';

@Controller('task')
export class TaskController {
  constructor(private readonly afdianService: AfdianService) {}

  activeRecentOrder() {
    return this.afdianService.activeRecentOrder(20);
  }
}
