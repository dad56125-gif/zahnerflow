/**
 * ZahnerFlow 浏览器端稳定性监控
 * 
 * 使用方法：
 * 1. 打开浏览器开发者工具 (F12)
 * 2. 粘贴此脚本到 Console
 * 3. 运行 startMonitor() 开始监控
 * 4. 运行 stopMonitor() 停止并查看报告
 */

(function () {
    let intervalId = null;
    let startTime = null;
    let samples = [];

    // 配置
    const CONFIG = {
        intervalMs: 60000,  // 采样间隔 1 分钟
        maxSamples: 1000    // 最多保存 1000 个样本
    };

    // 收集指标
    function collectMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            elapsed: startTime ? (Date.now() - startTime) / 60000 : 0
        };

        // 1. JavaScript 堆内存
        if (performance.memory) {
            metrics.jsHeapMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100;
            metrics.jsHeapTotalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100;
        }

        // 2. WebSocket 回调数组长度
        try {
            // Furnace
            if (window.furnaceWebSocketService?.callbacks) {
                metrics.furnaceCallbacks = Object.keys(window.furnaceWebSocketService.callbacks)
                    .reduce((sum, key) => sum + (window.furnaceWebSocketService.callbacks[key]?.length || 0), 0);
            }

            // 检查全局 socket.io 连接
            if (window.io?.managers) {
                metrics.socketConnections = Object.keys(window.io.managers).length;
            }
        } catch (e) {
            // 忽略访问错误
        }

        // 3. DOM 节点数
        metrics.domNodes = document.getElementsByTagName('*').length;

        // 4. 事件监听器估算 (通过 performance entries)
        metrics.performanceEntries = performance.getEntries().length;

        return metrics;
    }

    // 输出指标
    function logMetrics(m) {
        const status = [];

        // 检查异常
        if (m.jsHeapMB && samples.length > 0) {
            const initial = samples[0].jsHeapMB || 0;
            const growth = m.jsHeapMB - initial;
            if (growth > 50) status.push('⚠️ 内存增长 > 50MB');
        }

        if (m.furnaceCallbacks && m.furnaceCallbacks > 10) {
            status.push('🔴 回调累积!');
        }

        const statusStr = status.length > 0 ? status.join(' ') : '✅ 正常';

        console.log(
            `[${m.elapsed.toFixed(1)}min] ` +
            `Heap: ${m.jsHeapMB || 'N/A'}MB | ` +
            `DOM: ${m.domNodes} | ` +
            `Callbacks: ${m.furnaceCallbacks || 'N/A'} | ` +
            statusStr
        );
    }

    // 开始监控
    window.startMonitor = function (intervalMs = CONFIG.intervalMs) {
        if (intervalId) {
            console.log('⚠️ 监控已在运行中');
            return;
        }

        startTime = Date.now();
        samples = [];

        console.log('============================================');
        console.log(' ZahnerFlow 浏览器稳定性监控');
        console.log('============================================');
        console.log(`开始时间: ${new Date(startTime).toLocaleString()}`);
        console.log(`采样间隔: ${intervalMs / 1000}秒`);
        console.log('');
        console.log('运行 stopMonitor() 停止并查看报告');
        console.log('');

        // 立即采样一次
        const initial = collectMetrics();
        samples.push(initial);
        logMetrics(initial);

        // 定时采样
        intervalId = setInterval(() => {
            const m = collectMetrics();
            samples.push(m);
            if (samples.length > CONFIG.maxSamples) samples.shift();
            logMetrics(m);
        }, intervalMs);

        return '监控已启动';
    };

    // 停止监控
    window.stopMonitor = function () {
        if (!intervalId) {
            console.log('⚠️ 监控未运行');
            return;
        }

        clearInterval(intervalId);
        intervalId = null;

        const endTime = Date.now();
        const durationMin = (endTime - startTime) / 60000;

        console.log('');
        console.log('============================================');
        console.log(' 监控结束 - 报告');
        console.log('============================================');
        console.log(`运行时长: ${durationMin.toFixed(1)} 分钟`);
        console.log(`采样数: ${samples.length}`);
        console.log('');

        if (samples.length >= 2) {
            const first = samples[0];
            const last = samples[samples.length - 1];

            console.log('内存变化:');
            console.log(`  JS Heap: ${first.jsHeapMB || 'N/A'} MB -> ${last.jsHeapMB || 'N/A'} MB`);
            if (first.jsHeapMB && last.jsHeapMB) {
                const growth = last.jsHeapMB - first.jsHeapMB;
                const rate = growth / durationMin * 60;
                console.log(`  增长: ${growth.toFixed(2)} MB (${rate.toFixed(2)} MB/h)`);
            }

            console.log('');
            console.log('DOM 变化:');
            console.log(`  节点数: ${first.domNodes} -> ${last.domNodes}`);

            if (first.furnaceCallbacks !== undefined) {
                console.log('');
                console.log('回调变化:');
                console.log(`  Furnace: ${first.furnaceCallbacks} -> ${last.furnaceCallbacks || 'N/A'}`);
            }
        }

        console.log('');
        console.log('原始数据: window.stabilityData');
        window.stabilityData = samples;

        return samples;
    };

    // 导出数据为 CSV
    window.exportStabilityCSV = function () {
        if (!samples.length) {
            console.log('没有数据可导出');
            return;
        }

        const headers = Object.keys(samples[0]).join(',');
        const rows = samples.map(s => Object.values(s).join(','));
        const csv = [headers, ...rows].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stability-${Date.now()}.csv`;
        a.click();

        console.log('CSV 已下载');
    };

    console.log('📊 稳定性监控工具已加载');
    console.log('   startMonitor()  - 开始监控');
    console.log('   stopMonitor()   - 停止并查看报告');
    console.log('   exportStabilityCSV() - 导出数据');
})();
