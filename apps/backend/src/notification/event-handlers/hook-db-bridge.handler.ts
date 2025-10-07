import { Injectable, OnModuleInit } from '@nestjs/common';
import { SimpleEventBus } from '../simple-event-bus.service';
import { DbService } from '../../db/db.service';

@Injectable()
export class HookDbBridgeHandler implements OnModuleInit {
  constructor(
    private readonly eventBus: SimpleEventBus,
    private readonly db: DbService,
  ) {}

  onModuleInit(): void {
    this.eventBus.on('hook.insert.planned').subscribe((ev) => {
      this.db.emit('hook_insert_planned', ev.data);
    });
    this.eventBus.on('hook.insert.applied').subscribe((ev) => {
      this.db.emit('hook_insert_applied', ev.data);
    });
    this.eventBus.on('hook.insert.suppressed').subscribe((ev) => {
      this.db.emit('hook_suppressed', ev.data);
    });
  }
}

