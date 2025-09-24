# Zahner设备函数更新与前端节点配置文档

## 概述

本文档基于Zahner设备控制流程文档，提供了从函数定义到前端节点设定的完整实现方案，涵盖了所有已知Zahner设备层函数的更新和前端节点的配置。

## 1. 设备层函数定义

### 1.1 Python FastAPI设备层函数更新

#### 1.1.1 EIS测量函数

**文件位置**: `apps/backend/scripts/zahner_device.py`

```python
# 恒电位EIS测量
@app.post("/measure/eis/potentiostatic")
async def measure_eis_potentiostatic(request: EISPotentiostaticRequest):
    """恒电位电化学阻抗谱测量"""
    global device_wrapper

    try:
        send_notification("EIS测量", "开始恒电位EIS测量...", "info", "zahner_device.py:measure_eis_potentiostatic")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)

        # 配置输出文件
        file_output_configurator.setup_eis_output("potentiostatic", request.output_config)

        # 设置EIS参数
        device_wrapper.setEISAmplitude(request.eis_amplitude)
        device_wrapper.setPotential(request.eis_potential if request.enable_dc_bias else 0.0)

        # 设置频率范围
        device_wrapper.setEISFrequencyRange(
            request.eis_lower_frequency,
            request.eis_upper_frequency,
            request.eis_start_frequency
        )

        # 设置扫描参数
        device_wrapper.setEISScanParameters(
            request.eis_lower_periods,
            request.eis_upper_periods,
            request.eis_lower_steps,
            request.eis_upper_steps,
            AVAILABLE_SCAN_DIRECTIONS.get(request.eis_scan_direction, ScanDirection.START_TO_MIN),
            AVAILABLE_SCAN_STRATEGIES.get(request.eis_scan_strategy, ScanStrategy.SINGLE_SINE)
        )

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureEIS()
        device_wrapper.disablePotentiostat()

        # 重置振幅
        device_wrapper.setAmplitude(0)

        send_notification("EIS测量", "恒电位EIS测量完成", "success", "zahner_device.py:measure_eis_potentiostatic")

        return {
            "success": True,
            "data": {
                "measurement_type": "eis_potentiostatic",
                "output_path": request.output_config.output_path,
                "parameters": request.dict()
            }
        }

    except Exception as e:
        error_msg = f"恒电位EIS测量失败: {str(e)}"
        send_notification("EIS测量", error_msg, "error", "zahner_device.py:measure_eis_potentiostatic")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
            device_wrapper.setAmplitude(0)

# 恒电流EIS测量
@app.post("/measure/eis/galvanostatic")
async def measure_eis_galvanostatic(request: EISGalvanostaticRequest):
    """恒电流电化学阻抗谱测量"""
    global device_wrapper

    try:
        send_notification("EIS测量", "开始恒电流EIS测量...", "info", "zahner_device.py:measure_eis_galvanostatic")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)

        # 配置输出文件
        file_output_configurator.setup_eis_output("galvanostatic", request.output_config)

        # 设置EIS参数
        device_wrapper.setEISAmplitude(request.eis_amplitude)
        device_wrapper.setCurrent(request.eis_current if request.enable_dc_bias else 0.0)

        # 设置频率范围
        device_wrapper.setEISFrequencyRange(
            request.eis_lower_frequency,
            request.eis_upper_frequency,
            request.eis_start_frequency
        )

        # 设置扫描参数
        device_wrapper.setEISScanParameters(
            request.eis_lower_periods,
            request.eis_upper_periods,
            request.eis_lower_steps,
            request.eis_upper_steps,
            AVAILABLE_SCAN_DIRECTIONS.get(request.eis_scan_direction, ScanDirection.START_TO_MIN),
            AVAILABLE_SCAN_STRATEGIES.get(request.eis_scan_strategy, ScanStrategy.SINGLE_SINE)
        )

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureEIS()
        device_wrapper.disablePotentiostat()

        # 重置振幅
        device_wrapper.setAmplitude(0)

        send_notification("EIS测量", "恒电流EIS测量完成", "success", "zahner_device.py:measure_eis_galvanostatic")

        return {
            "success": True,
            "data": {
                "measurement_type": "eis_galvanostatic",
                "output_path": request.output_config.output_path,
                "parameters": request.dict()
            }
        }

    except Exception as e:
        error_msg = f"恒电流EIS测量失败: {str(e)}"
        send_notification("EIS测量", error_msg, "error", "zahner_device.py:measure_eis_galvanostatic")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
            device_wrapper.setAmplitude(0)
```

#### 1.1.2 OCP测量函数

```python
@app.post("/measure/ocp")
async def measure_ocp(request: OCPRequest):
    """开路电位测量"""
    global device_wrapper

    try:
        send_notification("OCP测量", "开始开路电位测量...", "info", "zahner_device.py:measure_ocp")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 配置输出文件
        file_output_configurator.setup_ocp_output(request.output_config)

        # 设置测量参数
        device_wrapper.setOCPMeasurementDuration(request.measurement_duration)
        device_wrapper.setSamplingInterval(request.sampling_interval)

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureOCP()
        device_wrapper.disablePotentiostat()

        send_notification("OCP测量", "开路电位测量完成", "success", "zahner_device.py:measure_ocp")

        return {
            "success": True,
            "data": {
                "measurement_type": "ocp",
                "output_path": request.output_config.output_path,
                "duration": request.measurement_duration,
                "sampling_interval": request.sampling_interval
            }
        }

    except Exception as e:
        error_msg = f"开路电位测量失败: {str(e)}"
        send_notification("OCP测量", error_msg, "error", "zahner_device.py:measure_ocp")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
```

#### 1.1.3 计时安培法测量函数

```python
@app.post("/measure/chronoamperometry")
async def measure_chronoamperometry(request: ChronoamperometryRequest):
    """计时安培法测量"""
    global device_wrapper

    try:
        send_notification("计时安培法", "开始计时安培法测量...", "info", "zahner_device.py:measure_chronoamperometry")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 配置输出文件
        file_output_configurator.setup_chronoamperometry_output(request.output_config)

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)

        # 设置测量参数
        device_wrapper.setPotential(request.polarization_voltage)
        device_wrapper.setMinCurrent(request.min_current)
        device_wrapper.setMaxCurrent(request.max_current)
        device_wrapper.setMeasurementDuration(request.measurement_duration)
        device_wrapper.setSamplingInterval(request.sampling_interval)

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureChronoamperometry()
        device_wrapper.disablePotentiostat()

        send_notification("计时安培法", "计时安培法测量完成", "success", "zahner_device.py:measure_chronoamperometry")

        return {
            "success": True,
            "data": {
                "measurement_type": "chronoamperometry",
                "output_path": request.output_config.output_path,
                "polarization_voltage": request.polarization_voltage,
                "duration": request.measurement_duration
            }
        }

    except Exception as e:
        error_msg = f"计时安培法测量失败: {str(e)}"
        send_notification("计时安培法", error_msg, "error", "zahner_device.py:measure_chronoamperometry")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
```

#### 1.1.4 计时电位法测量函数

```python
@app.post("/measure/chronopotentiometry")
async def measure_chronopotentiometry(request: ChronopotentiometryRequest):
    """计时电位法测量"""
    global device_wrapper

    try:
        send_notification("计时电位法", "开始计时电位法测量...", "info", "zahner_device.py:measure_chronopotentiometry")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 配置输出文件
        file_output_configurator.setup_chronopotentiometry_output(request.output_config)

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)

        # 设置测量参数
        device_wrapper.setCurrent(request.polarization_current)
        device_wrapper.setMinVoltage(request.min_voltage)
        device_wrapper.setMaxVoltage(request.max_voltage)
        device_wrapper.setMeasurementDuration(request.measurement_duration)
        device_wrapper.setSamplingInterval(request.sampling_interval)

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureChronopotentiometry()
        device_wrapper.disablePotentiostat()

        send_notification("计时电位法", "计时电位法测量完成", "success", "zahner_device.py:measure_chronopotentiometry")

        return {
            "success": True,
            "data": {
                "measurement_type": "chronopotentiometry",
                "output_path": request.output_config.output_path,
                "polarization_current": request.polarization_current,
                "duration": request.measurement_duration
            }
        }

    except Exception as e:
        error_msg = f"计时电位法测量失败: {str(e)}"
        send_notification("计时电位法", error_msg, "error", "zahner_device.py:measure_chronopotentiometry")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
```

#### 1.1.5 电压斜坡测量函数

```python
@app.post("/measure/voltage/ramp")
async def measure_voltage_ramp(request: VoltageRampRequest):
    """电压斜坡测量（线性扫描伏安法）"""
    global device_wrapper

    try:
        send_notification("电压斜坡", "开始电压斜坡测量...", "info", "zahner_device.py:measure_voltage_ramp")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 配置输出文件
        file_output_configurator.setup_voltage_ramp_output(request.output_config)

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)

        # 设置测量参数
        device_wrapper.setVoltageRampParameters(
            request.start_voltage,
            request.end_voltage,
            request.voltage_reference
        )
        device_wrapper.setMinCurrent(request.min_current)
        device_wrapper.setMaxCurrent(request.max_current)
        device_wrapper.setMeasurementDuration(request.measurement_duration)
        device_wrapper.setSamplingInterval(request.sampling_interval)

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureVoltageRamp()
        device_wrapper.disablePotentiostat()

        send_notification("电压斜坡", "电压斜坡测量完成", "success", "zahner_device.py:measure_voltage_ramp")

        return {
            "success": True,
            "data": {
                "measurement_type": "voltage_ramp",
                "output_path": request.output_config.output_path,
                "start_voltage": request.start_voltage,
                "end_voltage": request.end_voltage,
                "duration": request.measurement_duration
            }
        }

    except Exception as e:
        error_msg = f"电压斜坡测量失败: {str(e)}"
        send_notification("电压斜坡", error_msg, "error", "zahner_device.py:measure_voltage_ramp")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
```

#### 1.1.6 电流斜坡测量函数

```python
@app.post("/measure/current/ramp")
async def measure_current_ramp(request: CurrentRampRequest):
    """电流斜坡测量"""
    global device_wrapper

    try:
        send_notification("电流斜坡", "开始电流斜坡测量...", "info", "zahner_device.py:measure_current_ramp")

        # 验证设备连接
        if not device_wrapper:
            raise Exception("设备未连接")

        # 配置输出文件
        file_output_configurator.setup_current_ramp_output(request.output_config)

        # 设置恒电位仪模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)

        # 设置测量参数
        device_wrapper.setCurrentRampParameters(
            request.start_current,
            request.end_current
        )
        device_wrapper.setMinVoltage(request.min_voltage)
        device_wrapper.setMaxVoltage(request.max_voltage)
        device_wrapper.setMeasurementDuration(request.measurement_duration)
        device_wrapper.setSamplingInterval(request.sampling_interval)

        # 执行测量
        device_wrapper.enablePotentiostat()
        device_wrapper.measureCurrentRamp()
        device_wrapper.disablePotentiostat()

        send_notification("电流斜坡", "电流斜坡测量完成", "success", "zahner_device.py:measure_current_ramp")

        return {
            "success": True,
            "data": {
                "measurement_type": "current_ramp",
                "output_path": request.output_config.output_path,
                "start_current": request.start_current,
                "end_current": request.end_current,
                "duration": request.measurement_duration
            }
        }

    except Exception as e:
        error_msg = f"电流斜坡测量失败: {str(e)}"
        send_notification("电流斜坡", error_msg, "error", "zahner_device.py:measure_current_ramp")
        return {"success": False, "error": error_msg}
    finally:
        # 清理操作
        if device_wrapper:
            device_wrapper.disablePotentiostat()
```

### 1.2 数据模型定义

#### 1.2.1 EIS测量数据模型

```python
# apps/backend/scripts/models/eis_models.py
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class ScanDirection(str, Enum):
    START_TO_MAX = "START_TO_MAX"
    START_TO_MIN = "START_TO_MIN"

class ScanStrategy(str, Enum):
    SINGLE_SINE = "SINGLE_SINE"
    MULTI_SINE = "MULTI_SINE"

class OutputConfig(BaseModel):
    output_path: str = Field(..., description="输出文件路径")
    filename: str = Field("eis_data", description="文件名")
    naming_mode: str = Field("COUNTER", description="命名模式")
    counter: int = Field(1, description="计数器起始值")

class EISPotentiostaticRequest(BaseModel):
    # 输出配置
    output_config: OutputConfig

    # EIS频率参数
    eis_lower_frequency: float = Field(0.2, ge=0.0001, le=1000000, description="低频限制 [Hz]")
    eis_upper_frequency: float = Field(100000, ge=0.0001, le=1000000, description="高频限制 [Hz]")
    eis_start_frequency: float = Field(1000, ge=0.0001, le=1000000, description="起始频率 [Hz]")

    # EIS扫描参数
    eis_lower_periods: int = Field(4, ge=1, le=100, description="低频测量周期数")
    eis_upper_periods: int = Field(20, ge=1, le=100, description="高频测量周期数")
    eis_lower_steps: int = Field(5, ge=1, le=20, description="低频每十倍频步数")
    eis_upper_steps: int = Field(10, ge=1, le=20, description="高频每十倍频步数")
    eis_scan_direction: ScanDirection = Field(ScanDirection.START_TO_MIN, description="扫描方向")
    eis_scan_strategy: ScanStrategy = Field(ScanStrategy.SINGLE_SINE, description="扫描策略")

    # EIS振幅参数
    eis_amplitude: float = Field(25e-3, ge=1e-6, le=1.0, description="AC振幅 [V]")
    eis_potential: float = Field(0.0, ge=-10.0, le=10.0, description="DC偏置电位 [V]")
    enable_dc_bias: bool = Field(False, description="启用DC偏置")

class EISGalvanostaticRequest(BaseModel):
    # 输出配置
    output_config: OutputConfig

    # EIS频率参数（与恒电位相同）
    eis_lower_frequency: float = Field(0.2, ge=0.0001, le=1000000, description="低频限制 [Hz]")
    eis_upper_frequency: float = Field(100000, ge=0.0001, le=1000000, description="高频限制 [Hz]")
    eis_start_frequency: float = Field(1000, ge=0.0001, le=1000000, description="起始频率 [Hz]")

    # EIS扫描参数（与恒电位相同）
    eis_lower_periods: int = Field(4, ge=1, le=100, description="低频测量周期数")
    eis_upper_periods: int = Field(20, ge=1, le=100, description="高频测量周期数")
    eis_lower_steps: int = Field(5, ge=1, le=20, description="低频每十倍频步数")
    eis_upper_steps: int = Field(10, ge=1, le=20, description="高频每十倍频步数")
    eis_scan_direction: ScanDirection = Field(ScanDirection.START_TO_MIN, description="扫描方向")
    eis_scan_strategy: ScanStrategy = Field(ScanStrategy.SINGLE_SINE, description="扫描策略")

    # EIS振幅参数
    eis_amplitude: float = Field(25e-3, ge=1e-6, le=1.0, description="AC振幅 [A]")
    eis_current: float = Field(0.0, ge=-10.0, le=10.0, description="DC偏置电流 [A]")
    enable_dc_bias: bool = Field(False, description="启用DC偏置")
```

#### 1.2.2 其他测量数据模型

```python
# apps/backend/scripts/models/measurement_models.py
from pydantic import BaseModel, Field
from typing import Optional

class OCPRequest(BaseModel):
    output_config: OutputConfig
    measurement_duration: float = Field(60.0, ge=1.0, le=3600.0, description="测量时长 [s]")
    sampling_interval: float = Field(1.0, ge=0.01, le=60.0, description="采样间隔 [s]")

class ChronoamperometryRequest(BaseModel):
    output_config: OutputConfig
    polarization_voltage: float = Field(1.0, ge=-10.0, le=10.0, description="极化电压 [V]")
    min_current: float = Field(-1.0, ge=-10.0, le=10.0, description="最小电流安全限制 [A]")
    max_current: float = Field(1.0, ge=-10.0, le=10.0, description="最大电流安全限制 [A]")
    measurement_duration: float = Field(60.0, ge=1.0, le=3600.0, description="测量时长 [s]")
    sampling_interval: float = Field(0.1, ge=0.01, le=60.0, description="采样间隔 [s]")

class ChronopotentiometryRequest(BaseModel):
    output_config: OutputConfig
    polarization_current: float = Field(10e-3, ge=-10.0, le=10.0, description="极化电流 [A]")
    min_voltage: float = Field(-4.0, ge=-10.0, le=10.0, description="最小电压安全限制 [V]")
    max_voltage: float = Field(4.0, ge=-10.0, le=10.0, description="最大电压安全限制 [V]")
    measurement_duration: float = Field(60.0, ge=1.0, le=3600.0, description="测量时长 [s]")
    sampling_interval: float = Field(0.1, ge=0.01, le=60.0, description="采样间隔 [s]")

class VoltageRampRequest(BaseModel):
    output_config: OutputConfig
    start_voltage: float = Field(-0.5, ge=-10.0, le=10.0, description="起始电压 [V]")
    end_voltage: float = Field(0.8, ge=-10.0, le=10.0, description="终止电压 [V]")
    voltage_reference: str = Field("absolute", description="电压参考模式: absolute 或 ocv")
    min_current: float = Field(-1.0, ge=-10.0, le=10.0, description="最小电流安全限制 [A]")
    max_current: float = Field(1.0, ge=-10.0, le=10.0, description="最大电流安全限制 [A]")
    measurement_duration: float = Field(60.0, ge=1.0, le=3600.0, description="测量时长 [s]")
    sampling_interval: float = Field(0.1, ge=0.01, le=60.0, description="采样间隔 [s]")

class CurrentRampRequest(BaseModel):
    output_config: OutputConfig
    start_current: float = Field(-10e-3, ge=-10.0, le=10.0, description="起始电流 [A]")
    end_current: float = Field(10e-3, ge=-10.0, le=10.0, description="终止电流 [A]")
    min_voltage: float = Field(-4.0, ge=-10.0, le=10.0, description="最小电压安全限制 [V]")
    max_voltage: float = Field(4.0, ge=-10.0, le=10.0, description="最大电压安全限制 [V]")
    measurement_duration: float = Field(60.0, ge=1.0, le=3600.0, description="测量时长 [s]")
    sampling_interval: float = Field(0.1, ge=0.01, le=60.0, description="采样间隔 [s]")
```

## 2. NestJS后端服务层更新

### 2.1 ZahnerZenniumService扩展

**文件位置**: `apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts`

```typescript
@Injectable()
export class ZahnerZenniumService {
  private readonly logger = new Logger(ZahnerZenniumService.name);
  private isConnected = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly notificationService: NotificationService,
  ) {}

  // EIS测量方法
  async executeEISPotentiostatic(params: EISPotentiostaticParams): Promise<MeasurementResult> {
    this.logger.log('执行恒电位EIS测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/eis/potentiostatic', params);

      if (result.success) {
        this.notificationService.notifyDevice('恒电位EIS测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`恒电位EIS测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '恒电位EIS测量');
    }
  }

  async executeEISGalvanostatic(params: EISGalvanostaticParams): Promise<MeasurementResult> {
    this.logger.log('执行恒电流EIS测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/eis/galvanostatic', params);

      if (result.success) {
        this.notificationService.notifyDevice('恒电流EIS测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`恒电流EIS测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '恒电流EIS测量');
    }
  }

  // OCP测量方法
  async executeOCPMeasurement(params: OCPParams): Promise<MeasurementResult> {
    this.logger.log('执行OCP测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/ocp', params);

      if (result.success) {
        this.notificationService.notifyDevice('OCP测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`OCP测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, 'OCP测量');
    }
  }

  // 计时安培法测量方法
  async executeChronoamperometry(params: ChronoamperometryParams): Promise<MeasurementResult> {
    this.logger.log('执行计时安培法测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/chronoamperometry', params);

      if (result.success) {
        this.notificationService.notifyDevice('计时安培法测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`计时安培法测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '计时安培法测量');
    }
  }

  // 计时电位法测量方法
  async executeChronopotentiometry(params: ChronopotentiometryParams): Promise<MeasurementResult> {
    this.logger.log('执行计时电位法测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/chronopotentiometry', params);

      if (result.success) {
        this.notificationService.notifyDevice('计时电位法测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`计时电位法测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '计时电位法测量');
    }
  }

  // 电压斜坡测量方法
  async executeVoltageRamp(params: VoltageRampParams): Promise<MeasurementResult> {
    this.logger.log('执行电压斜坡测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/voltage/ramp', params);

      if (result.success) {
        this.notificationService.notifyDevice('电压斜坡测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`电压斜坡测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '电压斜坡测量');
    }
  }

  // 电流斜坡测量方法
  async executeCurrentRamp(params: CurrentRampParams): Promise<MeasurementResult> {
    this.logger.log('执行电流斜坡测量...');

    try {
      const result = await this.makeRequest<any>('POST', '/measure/current/ramp', params);

      if (result.success) {
        this.notificationService.notifyDevice('电流斜坡测量完成');
        return this.createSuccessResult(result.data);
      } else {
        this.notificationService.notifyError(`电流斜坡测量失败: ${result.error}`);
        return this.createErrorResult(result.error);
      }
    } catch (error) {
      return this.handleException(error, '电流斜坡测量');
    }
  }

  // 辅助方法
  private async makeRequest<T>(method: string, path: string, data?: any): Promise<T> {
    const config = {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url: `${this.baseUrl}${path}`,
          data,
          ...config,
        }).pipe(timeout(30000))
      );
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`FastAPI服务器连接失败: ${error.message}`);
      }
      throw error;
    }
  }

  private createSuccessResult(data: any): MeasurementResult {
    return {
      success: true,
      data: data,
      metadata: this.createMetadata(),
    };
  }

  private createErrorResult(error: string): MeasurementResult {
    return {
      success: false,
      error: error,
      metadata: this.createMetadata(),
    };
  }

  private handleException(error: any, measurementType: string): MeasurementResult {
    this.logger.error(`${measurementType}异常: ${error.message}`);
    return {
      success: false,
      error: error.message,
      metadata: this.createMetadata(),
    };
  }

  private createMetadata(): any {
    return {
      startTime: new Date(),
      endTime: new Date(),
      device: 'ZENNIUM',
    };
  }
}
```

### 2.2 类型定义扩展

**文件位置**: `packages/types/src/device.types.ts`

```typescript
// EIS测量参数类型
export interface EISPotentiostaticParams {
  output_config: OutputConfig;
  eis_lower_frequency: number;
  eis_upper_frequency: number;
  eis_start_frequency: number;
  eis_lower_periods: number;
  eis_upper_periods: number;
  eis_lower_steps: number;
  eis_upper_steps: number;
  eis_scan_direction: 'START_TO_MAX' | 'START_TO_MIN';
  eis_scan_strategy: 'SINGLE_SINE' | 'MULTI_SINE';
  eis_amplitude: number;
  eis_potential: number;
  enable_dc_bias: boolean;
}

export interface EISGalvanostaticParams {
  output_config: OutputConfig;
  eis_lower_frequency: number;
  eis_upper_frequency: number;
  eis_start_frequency: number;
  eis_lower_periods: number;
  eis_upper_periods: number;
  eis_lower_steps: number;
  eis_upper_steps: number;
  eis_scan_direction: 'START_TO_MAX' | 'START_TO_MIN';
  eis_scan_strategy: 'SINGLE_SINE' | 'MULTI_SINE';
  eis_amplitude: number;
  eis_current: number;
  enable_dc_bias: boolean;
}

// 其他测量参数类型
export interface OCPParams {
  output_config: OutputConfig;
  measurement_duration: number;
  sampling_interval: number;
}

export interface ChronoamperometryParams {
  output_config: OutputConfig;
  polarization_voltage: number;
  min_current: number;
  max_current: number;
  measurement_duration: number;
  sampling_interval: number;
}

export interface ChronopotentiometryParams {
  output_config: OutputConfig;
  polarization_current: number;
  min_voltage: number;
  max_voltage: number;
  measurement_duration: number;
  sampling_interval: number;
}

export interface VoltageRampParams {
  output_config: OutputConfig;
  start_voltage: number;
  end_voltage: number;
  voltage_reference: 'absolute' | 'ocv';
  min_current: number;
  max_current: number;
  measurement_duration: number;
  sampling_interval: number;
}

export interface CurrentRampParams {
  output_config: OutputConfig;
  start_current: number;
  end_current: number;
  min_voltage: number;
  max_voltage: number;
  measurement_duration: number;
  sampling_interval: number;
}

// 输出配置类型
export interface OutputConfig {
  output_path: string;
  filename?: string;
  naming_mode?: string;
  counter?: number;
}
```

## 3. 前端节点配置

### 3.1 节点类型定义扩展

**文件位置**: `apps/frontend/src/nodes/types.ts`

```json
{
  "nodes": {
    "eis_potentiostatic": {
      "type": "eis_potentiostatic",
      "name": "恒电位EIS",
      "category": "basic_measurement",
      "description": "恒电位电化学阻抗谱测量",
      "icon": "📊",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "EIS数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #667eea, #764ba2)",
        "borderColor": "#764ba2",
        "borderRadius": "8px",
        "textColor": "#ffffff",
        "icon": "📊"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/eis_pot_data",
          "filename": "eis_pot",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "eis_lower_frequency": 0.2,
        "eis_upper_frequency": 100000,
        "eis_start_frequency": 1000,
        "eis_lower_periods": 4,
        "eis_upper_periods": 20,
        "eis_lower_steps": 5,
        "eis_upper_steps": 10,
        "eis_scan_direction": "START_TO_MIN",
        "eis_scan_strategy": "SINGLE_SINE",
        "eis_amplitude": 0.025,
        "eis_potential": 0.0,
        "enable_dc_bias": false,
        "workstation": "zahner-zennium"
      }
    },
    "eis_galvanostatic": {
      "type": "eis_galvanostatic",
      "name": "恒电流EIS",
      "category": "basic_measurement",
      "description": "恒电流电化学阻抗谱测量",
      "icon": "📈",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "EIS数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #f093fb, #f5576c)",
        "borderColor": "#f5576c",
        "borderRadius": "8px",
        "textColor": "#ffffff",
        "icon": "📈"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/eis_gal_data",
          "filename": "eis_gal",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "eis_lower_frequency": 0.2,
        "eis_upper_frequency": 100000,
        "eis_start_frequency": 1000,
        "eis_lower_periods": 4,
        "eis_upper_periods": 20,
        "eis_lower_steps": 5,
        "eis_upper_steps": 10,
        "eis_scan_direction": "START_TO_MIN",
        "eis_scan_strategy": "SINGLE_SINE",
        "eis_amplitude": 0.025,
        "eis_current": 0.0,
        "enable_dc_bias": false,
        "workstation": "zahner-zennium"
      }
    },
    "ocp_measurement": {
      "type": "ocp_measurement",
      "name": "开路电位",
      "category": "basic_measurement",
      "description": "开路电位测量",
      "icon": "🔋",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "OCP数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #4facfe, #00f2fe)",
        "borderColor": "#00f2fe",
        "borderRadius": "8px",
        "textColor": "#ffffff",
        "icon": "🔋"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/ocp_data",
          "filename": "ocp",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "measurement_duration": 60.0,
        "sampling_interval": 1.0,
        "workstation": "zahner-zennium"
      }
    },
    "chronoamperometry": {
      "type": "chronoamperometry",
      "name": "计时安培法",
      "category": "basic_measurement",
      "description": "计时安培法测量",
      "icon": "⚡",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "CA数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #fa709a, #fee140)",
        "borderColor": "#fee140",
        "borderRadius": "8px",
        "textColor": "#ffffff",
        "icon": "⚡"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/ca_data",
          "filename": "ca",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "polarization_voltage": 1.0,
        "min_current": -1.0,
        "max_current": 1.0,
        "measurement_duration": 60.0,
        "sampling_interval": 0.1,
        "workstation": "zahner-zennium"
      }
    },
    "chronopotentiometry": {
      "type": "chronopotentiometry",
      "name": "计时电位法",
      "category": "basic_measurement",
      "description": "计时电位法测量",
      "icon": "⏱️",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "CP数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #a8edea, #fed6e3)",
        "borderColor": "#fed6e3",
        "borderRadius": "8px",
        "textColor": "#333333",
        "icon": "⏱️"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/cp_data",
          "filename": "cp",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "polarization_current": 0.01,
        "min_voltage": -4.0,
        "max_voltage": 4.0,
        "measurement_duration": 60.0,
        "sampling_interval": 0.1,
        "workstation": "zahner-zennium"
      }
    },
    "voltage_ramp": {
      "type": "voltage_ramp",
      "name": "电压斜坡",
      "category": "basic_measurement",
      "description": "电压斜坡测量（线性扫描伏安法）",
      "icon": "📉",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "电压斜坡数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #ffecd2, #fcb69f)",
        "borderColor": "#fcb69f",
        "borderRadius": "8px",
        "textColor": "#333333",
        "icon": "📉"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/voltage_ramp_data",
          "filename": "voltage_ramp",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "start_voltage": -0.5,
        "end_voltage": 0.8,
        "voltage_reference": "absolute",
        "min_current": -1.0,
        "max_current": 1.0,
        "measurement_duration": 60.0,
        "sampling_interval": 0.1,
        "workstation": "zahner-zennium"
      }
    },
    "current_ramp": {
      "type": "current_ramp",
      "name": "电流斜坡",
      "category": "basic_measurement",
      "description": "电流斜坡测量",
      "icon": "📈",
      "input": {
        "id": "input",
        "name": "输入",
        "dataType": "flow",
        "description": "流程输入"
      },
      "output": {
        "id": "output",
        "name": "输出",
        "dataType": "data",
        "description": "电流斜坡数据输出"
      },
      "style": {
        "width": 160,
        "height": 60,
        "background": "linear-gradient(135deg, #a8caba, #5d4e75)",
        "borderColor": "#5d4e75",
        "borderRadius": "8px",
        "textColor": "#ffffff",
        "icon": "📈"
      },
      "defaultParameters": {
        "output_config": {
          "output_path": "/tmp/current_ramp_data",
          "filename": "current_ramp",
          "naming_mode": "COUNTER",
          "counter": 1
        },
        "start_current": -0.01,
        "end_current": 0.01,
        "min_voltage": -4.0,
        "max_voltage": 4.0,
        "measurement_duration": 60.0,
        "sampling_interval": 0.1,
        "workstation": "zahner-zennium"
      }
    }
  }
}
```

### 3.2 前端节点组件实现

#### 3.2.1 EIS测量节点组件

**文件位置**: `apps/frontend/src/nodes/eis-node.tsx`

```typescript
import React, { useState } from 'react';
import { NodeComponentProps } from '../types/node-types';
import ParameterInput from '../components/ParameterInput';

interface EISNodeProps extends NodeComponentProps {
  variant: 'potentiostatic' | 'galvanostatic';
}

export const EISNode: React.FC<EISNodeProps> = ({ node, onUpdate, variant }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    output_config: {
      output_path: '/tmp/eis_data',
      filename: 'eis',
      naming_mode: 'COUNTER',
      counter: 1
    },
    eis_lower_frequency: 0.2,
    eis_upper_frequency: 100000,
    eis_start_frequency: 1000,
    eis_lower_periods: 4,
    eis_upper_periods: 20,
    eis_lower_steps: 5,
    eis_upper_steps: 10,
    eis_scan_direction: 'START_TO_MIN',
    eis_scan_strategy: 'SINGLE_SINE',
    eis_amplitude: 0.025,
    ...(variant === 'potentiostatic' ? { eis_potential: 0.0 } : { eis_current: 0.0 }),
    enable_dc_bias: false
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  const handleOutputConfigChange = (key: string, value: any) => {
    const newParameters = {
      ...parameters,
      output_config: { ...parameters.output_config, [key]: value }
    };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">📊</span>
        <span className="node-title">
          {variant === 'potentiostatic' ? '恒电位EIS' : '恒电流EIS'}
        </span>
      </div>

      <div className="node-parameters">
        {/* 输出配置 */}
        <div className="parameter-section">
          <h4>输出配置</h4>
          <ParameterInput
            label="输出路径"
            type="text"
            value={parameters.output_config.output_path}
            onChange={(value) => handleOutputConfigChange('output_path', value)}
          />
          <ParameterInput
            label="文件名"
            type="text"
            value={parameters.output_config.filename}
            onChange={(value) => handleOutputConfigChange('filename', value)}
          />
        </div>

        {/* 频率参数 */}
        <div className="parameter-section">
          <h4>频率参数</h4>
          <ParameterInput
            label="低频限制 (Hz)"
            type="number"
            value={parameters.eis_lower_frequency}
            onChange={(value) => handleParameterChange('eis_lower_frequency', value)}
            step={0.01}
            min={0.0001}
          />
          <ParameterInput
            label="高频限制 (Hz)"
            type="number"
            value={parameters.eis_upper_frequency}
            onChange={(value) => handleParameterChange('eis_upper_frequency', value)}
            step={1}
          />
          <ParameterInput
            label="起始频率 (Hz)"
            type="number"
            value={parameters.eis_start_frequency}
            onChange={(value) => handleParameterChange('eis_start_frequency', value)}
            step={1}
          />
        </div>

        {/* 扫描参数 */}
        <div className="parameter-section">
          <h4>扫描参数</h4>
          <ParameterInput
            label="低频周期数"
            type="integer"
            value={parameters.eis_lower_periods}
            onChange={(value) => handleParameterChange('eis_lower_periods', value)}
            min={1}
            max={100}
          />
          <ParameterInput
            label="高频周期数"
            type="integer"
            value={parameters.eis_upper_periods}
            onChange={(value) => handleParameterChange('eis_upper_periods', value)}
            min={1}
            max={100}
          />
          <ParameterInput
            label="扫描方向"
            type="select"
            value={parameters.eis_scan_direction}
            onChange={(value) => handleParameterChange('eis_scan_direction', value)}
            options={[
              { value: 'START_TO_MAX', label: '从低频到高频' },
              { value: 'START_TO_MIN', label: '从高频到低频' }
            ]}
          />
        </div>

        {/* 振幅和偏置 */}
        <div className="parameter-section">
          <h4>振幅和偏置</h4>
          <ParameterInput
            label="AC振幅"
            type="number"
            value={parameters.eis_amplitude}
            onChange={(value) => handleParameterChange('eis_amplitude', value)}
            step={0.001}
          />
          {variant === 'potentiostatic' ? (
            <ParameterInput
              label="DC偏置电位 (V)"
              type="number"
              value={parameters.eis_potential}
              onChange={(value) => handleParameterChange('eis_potential', value)}
              step={0.01}
              disabled={!parameters.enable_dc_bias}
            />
          ) : (
            <ParameterInput
              label="DC偏置电流 (A)"
              type="number"
              value={parameters.eis_current}
              onChange={(value) => handleParameterChange('eis_current', value)}
              step={0.001}
              disabled={!parameters.enable_dc_bias}
            />
          )}
          <ParameterInput
            label="启用DC偏置"
            type="boolean"
            value={parameters.enable_dc_bias}
            onChange={(value) => handleParameterChange('enable_dc_bias', value)}
          />
        </div>
      </div>
    </div>
  );
};
```

#### 3.2.2 OCP测量节点组件

**文件位置**: `apps/frontend/src/nodes/ocp-node.tsx`

```typescript
import React, { useState } from 'react';
import { NodeComponentProps } from '../types/node-types';
import ParameterInput from '../components/ParameterInput';

export const OCPNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    output_config: {
      output_path: '/tmp/ocp_data',
      filename: 'ocp',
      naming_mode: 'COUNTER',
      counter: 1
    },
    measurement_duration: 60.0,
    sampling_interval: 1.0
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  const handleOutputConfigChange = (key: string, value: any) => {
    const newParameters = {
      ...parameters,
      output_config: { ...parameters.output_config, [key]: value }
    };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">🔋</span>
        <span className="node-title">开路电位测量</span>
      </div>

      <div className="node-parameters">
        {/* 输出配置 */}
        <div className="parameter-section">
          <h4>输出配置</h4>
          <ParameterInput
            label="输出路径"
            type="text"
            value={parameters.output_config.output_path}
            onChange={(value) => handleOutputConfigChange('output_path', value)}
          />
          <ParameterInput
            label="文件名"
            type="text"
            value={parameters.output_config.filename}
            onChange={(value) => handleOutputConfigChange('filename', value)}
          />
        </div>

        {/* 测量参数 */}
        <div className="parameter-section">
          <h4>测量参数</h4>
          <ParameterInput
            label="测量时长 (s)"
            type="number"
            value={parameters.measurement_duration}
            onChange={(value) => handleParameterChange('measurement_duration', value)}
            step={1}
            min={1}
            max={3600}
          />
          <ParameterInput
            label="采样间隔 (s)"
            type="number"
            value={parameters.sampling_interval}
            onChange={(value) => handleParameterChange('sampling_interval', value)}
            step={0.01}
            min={0.01}
            max={60}
          />
        </div>
      </div>
    </div>
  );
};
```

### 3.3 执行引擎更新

**文件位置**: `apps/backend/src/modules/execution/execution.service.ts`

```typescript
@Injectable()
export class ExecutionService {
  constructor(
    private readonly zahnerService: ZahnerZenniumService,
    private readonly notificationService: NotificationService,
  ) {}

  async executeNode(node: WorkflowNode, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      let result: MeasurementResult;

      switch (node.type) {
        case 'eis_potentiostatic':
          result = await this.zahnerService.executeEISPotentiostatic(node.parameters);
          break;
        case 'eis_galvanostatic':
          result = await this.zahnerService.executeEISGalvanostatic(node.parameters);
          break;
        case 'ocp_measurement':
          result = await this.zahnerService.executeOCPMeasurement(node.parameters);
          break;
        case 'chronoamperometry':
          result = await this.zahnerService.executeChronoamperometry(node.parameters);
          break;
        case 'chronopotentiometry':
          result = await this.zahnerService.executeChronopotentiometry(node.parameters);
          break;
        case 'voltage_ramp':
          result = await this.zahnerService.executeVoltageRamp(node.parameters);
          break;
        case 'current_ramp':
          result = await this.zahnerService.executeCurrentRamp(node.parameters);
          break;
        default:
          throw new Error(`不支持的节点类型: ${node.type}`);
      }

      return {
        success: result.success,
        nodeId: node.id,
        data: result.data,
        error: result.error,
        timestamp: new Date(),
        executionTime: Date.now() - context.startTime
      };
    } catch (error) {
      this.notificationService.notifyError(`节点执行失败: ${error.message}`);
      return {
        success: false,
        nodeId: node.id,
        error: error.message,
        timestamp: new Date(),
        executionTime: Date.now() - context.startTime
      };
    }
  }
}
```

## 4. 部署和验证

### 4.1 部署步骤

#### 4.1.1 Python层部署
```bash
# 1. 更新zahner_device.py
cd apps/backend/scripts
python -m py_compile zahner_device.py  # 语法检查

# 2. 重启FastAPI服务
python -m uvicorn zahner_device:app --reload --port 8000
```

#### 4.1.2 NestJS层部署
```bash
# 1. 构建后端
cd apps/backend
pnpm build

# 2. 重启服务
pnpm start:dev
```

#### 4.1.3 前端部署
```bash
# 1. 构建前端
cd apps/frontend
pnpm build

# 2. 重启开发服务器
pnpm dev
```

### 4.2 验证清单

#### 4.2.1 功能验证
- [ ] Python FastAPI服务正常启动
- [ ] 所有测量端点返回正确的响应
- [ ] NestJS后端成功连接到FastAPI服务
- [ ] 前端正确显示所有新增的节点类型
- [ ] 节点参数编辑功能正常
- [ ] 工作流执行功能正常

#### 4.2.2 数据验证
- [ ] 测量数据文件正确生成
- [ ] 文件命名符合配置要求
- [ ] 数据格式符合预期
- [ ] 错误处理机制正常工作

#### 4.2.3 性能验证
- [ ] 测量执行时间在合理范围内
- [ ] 内存使用正常
- [ ] 并发执行稳定
- [ ] WebSocket连接稳定

## 5. 扩展指南

### 5.1 添加新的测量类型

#### 5.1.1 Python层
1. 在 `zahner_device.py` 中添加新的测量函数
2. 在 `models/` 中添加对应的数据模型
3. 更新FastAPI路由

#### 5.1.2 NestJS层
1. 在 `ZahnerZenniumService` 中添加对应的服务方法
2. 在 `packages/types/` 中添加类型定义
3. 更新控制器端点

#### 5.1.3 前端层
1. 在 `src/nodes/types.ts` 中添加节点定义
2. 创建对应的节点组件
3. 更新执行引擎

### 5.2 优化建议

#### 5.2.1 性能优化
- 实现测量结果的缓存机制
- 优化大文件的处理
- 添加并发控制

#### 5.2.2 功能扩展
- 添加数据可视化功能
- 实现测量结果的分析功能
- 支持更多的设备类型

#### 5.2.3 安全性
- 添加参数验证
- 实现访问控制
- 增强错误处理

## 6. 总结

本文档提供了从Python设备层函数定义到前端节点配置的完整实现方案，涵盖了：

1. **设备层函数**：完整的FastAPI测量函数实现
2. **数据模型**：严格的类型定义和验证
3. **服务层**：NestJS后端服务封装
4. **前端节点**：React组件和参数配置
5. **执行引擎**：统一的节点执行逻辑
6. **部署验证**：完整的部署和测试流程

这个方案确保了系统的可扩展性、类型安全性和用户体验的一致性。所有新增的测量类型都遵循相同的架构模式，便于后续的维护和扩展。