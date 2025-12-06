需要删除的内容
================

为排查前端PropertyPanel参数无法正确应用到设备执行的问题，在2025-12-06添加了临时日志代码。这些日志用于追踪参数传递链路，帮助诊断参数在哪个环节丢失或被修改。

待参数传递问题彻底解决并验证无误后，应删除这些临时日志，因为它们：
1. 会产生大量调试输出，干扰正常日志
2. 包含敏感参数信息（如电压、电流值）
3. 属于调试性质代码，不应保留在生产环境

Python FastAPI端 - 第212行
---------------------------
print(f"[API] Parameters: {raw_params}")

Node.js后端 - 第214行
---------------------
this.log('enableLog', `Sending measurement: type=${measurementType}, params=${JSON.stringify(parameters)}`);
