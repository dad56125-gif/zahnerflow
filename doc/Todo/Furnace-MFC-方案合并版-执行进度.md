# Furnace & MFC 方案执行进度（代理维护）

本文件用于勾选“合并版”中的 TODO（因原文件存在编码差异，避免误伤主体内容，进度单独记录在此并与实现严格对应）。

- [x] Types：在 `@zahnerflow/types` 增补导出 ProgramSegment、FurnacePresetMeta、FurnacePreset、MfcDeviceInfo、MfcStatus、MfcSetpointRequest、FurnaceSample、MfcSample（packages/types/src/device.types.ts）
- [x] FastAPI/Furnace：实现第 3 节 Furnace 端点（仅基础能力）（apps/backend/src/modules/Furnace/fastapi/ai518p_device.py）
- [x] FastAPI/MFC：实现第 3 节 MFC 端点（仅基础能力）（apps/backend/src/modules/MFC/fastapi/mfc_device.py）
- [x] 后端/Furnace：设备服务与模块桥接；预设 CRUD/clone/apply（含幂等与回滚）；预设写入 5 秒限流（apps/backend/src/modules/furnace/*, apps/backend/src/devices/furnace-device.service.ts）
- [x] 后端/MFC：设备服务与模块桥接；维护扫描缓存与 `/devices` 接口（apps/backend/src/modules/mfc/*, apps/backend/src/devices/mfc-device.service.ts）
- [x] 采样调度：Furnace/MFC 1s 采样、内存 1h 保留、JSON 滚动落盘、按日归档与索引
- [x] 历史查询：实现 Furnace/MFC 查询端点（from/to/limit/downsample），聚合内存 + 文件数据
- [x] 单元测试（已覆盖当前完成项）：
  - Furnace 预设流程：名唯一、克隆、5s 限流、幂等与失败回滚（apps/backend/test/furnace.service.test.ts）
  - MFC 扫描缓存合并（apps/backend/test/mfc.service.test.ts）
- [x] 执行日志：已在 `doc/EXECUTION_LOG.md` 追加两条记录（类型补充、模块与 FastAPI 基础）
- [ ] 文档汇总：待采样与历史查询完成后在“合并版”文件末尾追加“更新汇总”段落

运行与校验：
- 一次性安装：`pnpm install`
- 构建类型：`pnpm --filter @zahnerflow/types build`
- 构建后端：`pnpm --filter backend build`
- 冒烟验证：`pnpm --filter backend smoke`
- 单元测试：`pnpm --filter backend test:unit`
