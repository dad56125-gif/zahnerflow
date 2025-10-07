import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { DbService } from '../../db/db.service';
import { randomUUID } from 'crypto';

export interface RegisterFilePayload {
  ownerName: string;
  individualName: string;
  testType: string; // e.g. eis/iv/ocp
  prefix: string;   // 自定义前缀
  cycle: number;    // 循环次数
  timestamp?: string; // ISO 字符串，可选；默认当前时间
  extension?: string; // 文件扩展名（不带点），默认 'dat'
  createEmpty?: boolean; // 是否创建空文件，默认 false
  content?: string; // 可选：如提供则写入文件内容
}

export interface RegisterFileResult {
  relPath: string;  // archive 下的相对路径（不含文件名）
  filename: string; // 生成的文件名
  absPath: string;  // 绝对路径（包含文件名）
}

@Injectable()
export class FilesService {
  private readonly baseDir = process.env.FILES_BASE_DIR || 'archive';
  private readonly archiveRoot = path.join(process.cwd(), this.baseDir);
  private readonly indexFile = path.join(process.cwd(), 'data', 'files', 'index.json');

  constructor(private readonly db: DbService) {}

  async registerDataFile(payload: RegisterFilePayload): Promise<RegisterFileResult> {
    const owner = this.sanitize(payload.ownerName);
    const individual = this.sanitize(payload.individualName);
    const testType = this.sanitize(payload.testType).toLowerCase();
    const prefix = this.sanitize(payload.prefix);
    const cycle = Number.isFinite(payload.cycle) ? payload.cycle : 0;
    const ts = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const ext = this.sanitize(payload.extension || 'dat').replace(/^\.+/, '');
    const tsStr = this.formatTimestamp(ts);
    const cycleStr = String(cycle).padStart(3, '0');

    const relDir = path.join(this.baseDir, owner, individual, testType);
    const dirPath = path.join(process.cwd(), relDir);
    const filename = `${prefix}-${cycleStr}-${tsStr}.${ext}`;
    const absPath = path.join(dirPath, filename);

    await fs.promises.mkdir(dirPath, { recursive: true });
    if (payload.createEmpty || typeof payload.content === 'string') {
      await fs.promises.writeFile(absPath, payload.content ?? '', 'utf-8');
    }

    const tsIso = ts.toISOString();
    await this.appendIndex({
      ownerName: owner,
      individualName: individual,
      testType,
      prefix,
      cycle,
      timestamp: tsIso,
      filename,
      rel_path: path.join(owner, individual, testType),
    });

    // 写入数据库索引
    await this.db.insertDataFile({
      id: randomUUID(),
      owner_name: owner,
      individual_name: individual,
      test_type: testType,
      prefix,
      cycle,
      ts: tsIso,
      filename,
      rel_path: path.join(owner, individual, testType),
    });

    return { relPath: path.join(this.baseDir, owner, individual, testType), filename, absPath };
  }

  private sanitize(input: string): string {
    return (input || '')
      .replace(/\\/g, '-')
      .replace(/\//g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_\.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      d.getFullYear().toString() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + '-' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  private async appendIndex(entry: Record<string, any>): Promise<void> {
    const dir = path.dirname(this.indexFile);
    await fs.promises.mkdir(dir, { recursive: true });
    let data: any = { files: [] as any[] };
    try {
      const raw = await fs.promises.readFile(this.indexFile, 'utf-8');
      data = JSON.parse(raw);
      if (!Array.isArray(data.files)) data.files = [];
    } catch {
      // ignore, create fresh
    }
    data.files.push(entry);
    await fs.promises.writeFile(this.indexFile, JSON.stringify(data, null, 2), 'utf-8');
  }
}
