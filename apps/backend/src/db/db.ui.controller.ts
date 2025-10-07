import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('db')
export class DbUiController {
  @Get()
  index(@Res() res: Response) {
    // 静态页面已由 main.ts 挂载到 public 目录
    return res.redirect('/db-ui.html');
  }
}

