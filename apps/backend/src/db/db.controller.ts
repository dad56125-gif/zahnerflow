import { Controller, Get, Query, Sse } from '@nestjs/common';
import { DbService } from './db.service';
import { Observable, map } from 'rxjs';
import { SimpleEventBus } from '../notification/simple-event-bus.service';

@Controller('api/db')
export class DbController {
  constructor(private readonly db: DbService, private readonly eventBus: SimpleEventBus) {}

  @Get('stats')
  async stats() {
    const s = await this.db.getStats();
    return { success: true, stats: s };
  }

  @Get('workflows')
  async queryWorkflows(
    @Query('owner') owner?: string,
    @Query('individual') individual?: string,
    @Query('title') title?: string,
    @Query('keyword') keyword?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('sortBy') sortBy: 'created_at' | 'updated_at' | 'title' = 'updated_at',
    @Query('order') order: 'asc' | 'desc' = 'desc',
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const { items, total } = await this.db.queryWorkflows({
      owner_name: owner,
      individual_name: individual,
      title,
      keyword,
      created_from: createdFrom,
      created_to: createdTo,
      sortBy,
      order,
      page: Number(page),
      limit: Number(limit),
    });
    return { items, total, page: Number(page), limit: Number(limit) };
  }

  @Get('data-files')
  async queryDataFiles(
    @Query('owner') owner?: string,
    @Query('individual') individual?: string,
    @Query('testType') testType?: string,
    @Query('prefix') prefix?: string,
    @Query('cycle') cycle?: string,
    @Query('filename') filenameContains?: string,
    @Query('tsFrom') tsFrom?: string,
    @Query('tsTo') tsTo?: string,
    @Query('sortBy') sortBy: 'ts' | 'filename' = 'ts',
    @Query('order') order: 'asc' | 'desc' = 'desc',
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const { items, total } = await this.db.queryDataFiles({
      owner_name: owner,
      individual_name: individual,
      test_type: testType,
      prefix,
      cycle: typeof cycle !== 'undefined' ? Number(cycle) : undefined,
      filename_contains: filenameContains,
      ts_from: tsFrom,
      ts_to: tsTo,
      sortBy,
      order,
      page: Number(page),
      limit: Number(limit),
    });
    return { items, total, page: Number(page), limit: Number(limit) };
  }

  @Get('nodes')
  async queryNodes(
    @Query('workflowId') workflowId?: string,
    @Query('nodeType') nodeType?: string,
    @Query('key') nodeKey?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const { items, total } = await this.db.queryNodes({
      workflow_id: workflowId,
      node_type: nodeType,
      node_key: nodeKey,
      page: Number(page),
      limit: Number(limit),
    });
    return { items, total, page: Number(page), limit: Number(limit) };
  }

  @Get('node-params')
  async queryNodeParams(
    @Query('nodeId') nodeId?: string,
    @Query('key') key?: string,
    @Query('valueContains') valueContains?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 100,
  ) {
    const { items, total } = await this.db.queryNodeParams({
      node_id: nodeId,
      key,
      value_contains: valueContains,
      page: Number(page),
      limit: Number(limit),
    });
    return { items, total, page: Number(page), limit: Number(limit) };
  }

  @Get('events/recent')
  async recentEvents(@Query('limit') limit = 50) {
    const events = this.db.getRecentEvents(Number(limit));
    return { items: events, total: events.length };
  }

  @Sse('events/stream')
  streamEvents(): Observable<any> {
    return this.db.getEvents().pipe(map((e) => ({ data: e })));
  }

  @Get('events/ping')
  pingEvent() {
    const payload = { ok: true, ts: new Date().toISOString() };
    this.db.emit('ping_test', payload);
    return { success: true, emitted: payload };
  }

  @Get('events/test-hook')
  testHook() {
    const payload = { ruleId: 'test', workflowId: 'wf_test', targetNodeId: 'node_x', loopContext: { loopNodeId: 'outer', depth: 1, iteration: 1 } };
    this.eventBus.emit('hook.insert.planned', payload);
    this.eventBus.emit('hook.insert.applied', { ...payload, insertedNodeId: 'node_tmp_test' });
    return { success: true };
  }
}
