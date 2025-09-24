import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NotificationService } from './notification/notification.service';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * 应用程序启动类
 * 专门为ZahnerFlow前后端分离项目设计
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // 启用WebSocket适配器（在服务器启动之前）
  app.useWebSocketAdapter(new IoAdapter(app));

  // 静态文件服务 - 提供日志配置HTML页面
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // CORS配置 - 允许前端开发服务器和打包后的应用访问
  app.enableCors({
    origin: [
      'http://localhost:8081',     // Vite开发服务器
      'http://localhost:8083',     // 当前前端运行端口
      'http://localhost:4173',     // Vite预览服务器
      'http://localhost:3000',     // 可能的前端端口
      'http://127.0.0.1:8081',     // 本地访问
      'http://127.0.0.1:8083',     // 本地访问8083端口
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With, X-API-Key, api-version',
  });

  // 获取端口 - 与前端开发环境协调
  const port = process.env.PORT || 3001; // 使用3001端口，避免与前端冲突

  await app.listen(port);

  // 注入通知服务
  const notificationService = app.get(NotificationService);

  // 系统启动通知
  notificationService.notifySystem(
    `ZahnerFlow Backend API Server is running on: http://localhost:${port}`,
    `Environment: ${process.env.NODE_ENV}, Port: ${port}`
  );

  // 前端开发服务器配置通知
  notificationService.notifySystem(
    `Frontend development server should run on: http://localhost:8081`,
    '前端开发服务器配置'
  );

  // 后端启动完成通知
  notificationService.notifySystem(
    'Backend startup complete',
    '所有服务已初始化并准备接收连接'
  );
}

bootstrap().catch(err => {
  console.error('Failed to start backend application:', err);
  process.exit(1);
});