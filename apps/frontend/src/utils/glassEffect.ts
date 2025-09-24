/**
 * 玻璃态反光效果工具
 * 完全按照demo实现鼠标点反光、3D倾斜和边缘高亮效果
 */

class GlassEffect {
  private initialized = false;

  init() {
    if (this.initialized) return;
    
    const observer = this.setupGlassEffects();
    this.initialized = true;
    return observer;
  }

  destroy() {
    if (!this.initialized) return;
    
    // 清理所有事件监听器
    const glassElements = document.querySelectorAll('.glass');
    glassElements.forEach(element => {
      // 移除动态创建的子元素
      const mainShine = element.querySelector('.glass-main-shine');
      const edgeGlow = element.querySelector('.glass-edge-glow');
      
      if (mainShine) mainShine.remove();
      if (edgeGlow) edgeGlow.remove();
      
      // 克隆元素以移除事件监听器
      const clone = element.cloneNode(true);
      element.parentNode?.replaceChild(clone, element);
    });
    
    this.initialized = false;
  }

  private setupGlassEffects() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.classList.contains('glass')) {
              this.setupElementEffects(element);
            }
            
            // 检查子元素
            element.querySelectorAll('.glass').forEach((glassElement) => {
              this.setupElementEffects(glassElement);
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初始化现有元素
    document.querySelectorAll('.glass').forEach((element) => {
      this.setupElementEffects(element);
    });

    return observer;
  }

  private setupElementEffects(element: Element) {
    // 如果已经设置过效果，跳过
    if (element.querySelector('.glass-main-shine')) return;
    
    // 排除框架元素（只让具体交互元素有效果）
    if (element.classList.contains('toolbar') || 
        element.classList.contains('sidebar') ||
        element.classList.contains('right-panels') ||
        element.classList.contains('status-bar') ||
        element.classList.contains('property-panel') ||
        element.classList.contains('canvas-container') ||
        element.classList.contains('canvas-grid') ||
        element.classList.contains('floating-toolbar') ||
        element.classList.contains('top-navbar')) {
      return;
    }

    // 计算控件尺寸和反光大小
    function getElementDimensions() {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        shineSize: Math.min(rect.width, rect.height) * 0.9 // 90%的控件尺寸
      };
    }
    
    // 创建主反光效果
    const mainShine = document.createElement('div');
    mainShine.className = 'glass-main-shine';
    mainShine.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 50%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      transform: translate(-50%, -50%);
      z-index: 10;
    `;
    element.appendChild(mainShine);
    
    // 创建边缘光泽效果
    const edgeGlow = document.createElement('div');
    edgeGlow.className = 'glass-edge-glow';
    edgeGlow.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
      transition: all 0.4s ease;
      z-index: 5;
    `;
    element.appendChild(edgeGlow);
    
    let currentDims = getElementDimensions();
    
    // 更新反光效果
    function updateShineEffect(x: number, y: number) {
      const dims = getElementDimensions();
      currentDims = dims;
      
      // 更新主反光
      mainShine.style.width = dims.shineSize + 'px';
      mainShine.style.height = dims.shineSize + 'px';
      mainShine.style.left = x + 'px';
      mainShine.style.top = y + 'px';
      mainShine.style.background = `radial-gradient(circle, 
        rgba(255, 255, 255, 0.4) 0%, 
        rgba(255, 255, 255, 0.35) 15%,
        rgba(255, 255, 255, 0.18) 30%,
        rgba(255, 255, 255, 0.08) 45%,
        transparent 60%
      )`;
      mainShine.style.filter = 'blur(8px)';
      mainShine.style.webkitFilter = 'blur(8px)';
      mainShine.style.opacity = '1';
      
      // 计算鼠标相对位置 (0-1)
      const relativeX = x / dims.width;
      const relativeY = y / dims.height;
      
      // 更新边缘光泽效果
      updateEdgeGlow(relativeX, relativeY);
      
      // 更新3D倾斜效果
      update3DTilt(relativeX, relativeY);
    }
    
    // 更新边缘光泽效果
    function updateEdgeGlow(relativeX: number, relativeY: number) {
      const maxIntensity = 0.4; // 增加最大亮度
      const minIntensity = 0.02; // 降低最小亮度，远离鼠标的一侧几乎不亮
      const edgeSize = 3;
      
      // 计算各边的亮度 - 使用距离的平方来增强对比度
      const topDistance = relativeY;
      const bottomDistance = 1 - relativeY;
      const leftDistance = relativeX;
      const rightDistance = 1 - relativeX;
      
      // 使用平方函数让远离鼠标的一侧更暗
      const topBrightness = topDistance < 0.5 ? 
        Math.pow(1 - topDistance, 2) * maxIntensity : 
        minIntensity;
      
      const bottomBrightness = bottomDistance < 0.5 ? 
        Math.pow(1 - bottomDistance, 2) * maxIntensity : 
        minIntensity;
      
      const leftBrightness = leftDistance < 0.5 ? 
        Math.pow(1 - leftDistance, 2) * maxIntensity : 
        minIntensity;
      
      const rightBrightness = rightDistance < 0.5 ? 
        Math.pow(1 - rightDistance, 2) * maxIntensity : 
        minIntensity;
      
      edgeGlow.style.background = `
        linear-gradient(to bottom, 
          rgba(255, 255, 255, ${topBrightness}) 0%, 
          transparent ${edgeSize * 2}px,
          transparent calc(100% - ${edgeSize * 2}px),
          rgba(255, 255, 255, ${bottomBrightness}) 100%
        ),
        linear-gradient(to right, 
          rgba(255, 255, 255, ${leftBrightness}) 0%, 
          transparent ${edgeSize * 2}px,
          transparent calc(100% - ${edgeSize * 2}px),
          rgba(255, 255, 255, ${rightBrightness}) 100%
        )
      `;
      edgeGlow.style.boxShadow = `
        inset 0 0 ${edgeSize * 3}px rgba(255, 255, 255, ${topBrightness * 0.6}),
        inset 0 0 ${edgeSize * 3}px rgba(255, 255, 255, ${bottomBrightness * 0.6}),
        inset 0 0 ${edgeSize * 3}px rgba(255, 255, 255, ${leftBrightness * 0.6}),
        inset 0 0 ${edgeSize * 3}px rgba(255, 255, 255, ${rightBrightness * 0.6})
      `;
      edgeGlow.style.opacity = '1';
    }
    
    // 更新3D倾斜效果
    function update3DTilt(relativeX: number, relativeY: number) {
      const dims = getElementDimensions();
      const elementSize = Math.min(dims.width, dims.height);
      
      // 根据元素尺寸动态调整倾斜强度 - 小尺寸元素效果更强
      let maxTilt;
      if (elementSize < 60) {
        // 很小的元素（如小按钮、节点）
        maxTilt = 20; // 强倾斜效果
      } else if (elementSize < 120) {
        // 中等元素（如大按钮、卡片）
        maxTilt = 15; // 中等倾斜效果
      } else if (elementSize < 200) {
        // 较大元素
        maxTilt = 10; // 轻微倾斜效果
      } else {
        // 很大的元素（如面板）
        maxTilt = 6; // 极轻微倾斜效果
      }
      
      const tiltX = (relativeY - 0.5) * maxTilt; // Y轴控制X轴倾斜
      const tiltY = (0.5 - relativeX) * maxTilt; // X轴控制Y轴倾斜
      
      (element as HTMLElement).style.transform = `
        perspective(1000px) 
        rotateX(${tiltX}deg) 
        rotateY(${tiltY}deg)
        translateZ(0)
      `;
      (element as HTMLElement).style.transition = 'transform 0.2s ease-out';
    }
    
    // 鼠标移动事件
    element.addEventListener('mousemove', function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      updateShineEffect(x, y);
    });
    
    // 鼠标离开事件
    element.addEventListener('mouseleave', function() {
      mainShine.style.opacity = '0';
      edgeGlow.style.opacity = '0';
      (element as HTMLElement).style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)';
    });
    
    // 鼠标进入事件
    element.addEventListener('mouseenter', function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      updateShineEffect(x, y);
    });
    
    // 窗口大小改变时重新计算尺寸
    window.addEventListener('resize', () => {
      currentDims = getElementDimensions();
    });
  }
}

export const glassEffect = new GlassEffect();

// 自动初始化
if (typeof window !== 'undefined') {
  glassEffect.init();
}

// 为所有玻璃态元素自动添加反光效果
export function setupAutoGlassEffect() {
  return glassEffect.init();
}