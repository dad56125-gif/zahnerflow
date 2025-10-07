import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { FilesService, RegisterFilePayload } from './files.service';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * 注册/生成数据文件路径并（可选）创建文件
   * 请求体：
   * { ownerName, individualName, testType, prefix, cycle, timestamp?, extension?, createEmpty?, content? }
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body: RegisterFilePayload) {
    const result = await this.filesService.registerDataFile(body);
    return { success: true, ...result };
  }
}

