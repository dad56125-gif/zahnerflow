import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Welcome to ZahnerFlow Backend API!';
  }

  @Get('api')
  getApiInfo() {
    return {
      message: 'ZahnerFlow Backend API',
      version: '1.0.0',
      status: 'running',
      endpoints: [
        'GET /api - API信息',
        'GET /health - 健康检查',
        'GET /api/executions - 执行模块API',
        'GET /api/devices/zahner-zennium - Zahner ZENNIUM设备API',
        'GET /api/workflows - 工作流API',
        'GET /api/precheck - 预检API',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}

