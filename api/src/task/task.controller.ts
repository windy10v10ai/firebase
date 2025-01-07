import { Controller } from '@nestjs/common';

import { AfdianService } from '../afdian/afdian.service';

@Controller('task')
export class TaskController {
  constructor(private readonly afdianService: AfdianService) {}

  activeRecentOrder(orderNumber: number = 20) {
    return this.afdianService.activeRecentOrder(orderNumber);
  }
}
