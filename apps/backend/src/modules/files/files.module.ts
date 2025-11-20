import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
// 如果 DbModule 是全局的，这行都不需要
// import { DbModule } from '../../db/db.module'; 

@Module({
  imports: [], // 保持清爽
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}