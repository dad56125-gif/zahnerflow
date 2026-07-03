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
    
    const glassElements = document.querySelectorAll('.glass');
    glassElements.forEach(element => {
      const mainShine = element.querySelector('.glass-main-shine');
      const edgeGlow = element.querySelector('.glass-edge-glow');
      
      if (mainShine) mainShine.remove();
      if (edgeGlow) edgeGlow.remove();
      
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

    document.querySelectorAll('.glass').forEach((element) => {
      this.setupElementEffects(element);
    });

    return observer;
  }

  private setupElementEffects(element: Element) {
    if (element.querySelector('.glass-main-shine')) return;

    // 白名单机制：只有明确列出的类名才会应用玻璃效果
    const allowedClasses: string[] = [
      'btn'
    ];

    const hasAllowedClass = allowedClasses.some(className => element.classList.contains(className));
    if (!hasAllowedClass) {
      return;
    }

    const mainShine = document.createElement('div');
    mainShine.className = 'glass-main-shine';
    mainShine.style.cssText = `
      position: absolute; top: 0; left: 0; border-radius: 50%; pointer-events: none; opacity: 0;
      transition: opacity 0.3s ease; transform: translate(-50%, -50%); z-index: 10;
    `;
    element.appendChild(mainShine);

    const edgeGlow = document.createElement('div');
    edgeGlow.className = 'glass-edge-glow';
    edgeGlow.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: inherit;
      pointer-events: none; opacity: 0; transition: all 0.4s ease; z-index: 5;
    `;
    element.appendChild(edgeGlow);

    const getElementDimensions = () => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, shineSize: Math.min(rect.width, rect.height) * 0.9 };
    };

    const update3DTilt = (relativeX: number, relativeY: number) => {
      const dims = getElementDimensions();
      const elementSize = Math.min(dims.width, dims.height);
      let maxTilt = (elementSize < 60) ? 20 : (elementSize < 120) ? 15 : (elementSize < 200) ? 10 : 6;
      const tiltX = (relativeY - 0.5) * maxTilt;
      const tiltY = (0.5 - relativeX) * maxTilt;
      (element as HTMLElement).style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(0)`;
      (element as HTMLElement).style.transition = 'transform 0.2s ease-out';
    };

    const updateEdgeGlow = (relativeX: number, relativeY: number) => {
        const maxIntensity = 0.4, minIntensity = 0.02, edgeSize = 3;
        const topBrightness = relativeY < 0.5 ? Math.pow(1 - relativeY, 2) * maxIntensity : minIntensity;
        const bottomBrightness = (1 - relativeY) < 0.5 ? Math.pow(1 - (1 - relativeY), 2) * maxIntensity : minIntensity;
        const leftBrightness = relativeX < 0.5 ? Math.pow(1 - relativeX, 2) * maxIntensity : minIntensity;
        const rightBrightness = (1 - relativeX) < 0.5 ? Math.pow(1 - (1 - relativeX), 2) * maxIntensity : minIntensity;
        edgeGlow.style.background = `
            linear-gradient(to bottom, rgba(255, 255, 255, ${topBrightness}) 0%, transparent ${edgeSize * 2}px, transparent calc(100% - ${edgeSize * 2}px), rgba(255, 255, 255, ${bottomBrightness}) 100%),
            linear-gradient(to right, rgba(255, 255, 255, ${leftBrightness}) 0%, transparent ${edgeSize * 2}px, transparent calc(100% - ${edgeSize * 2}px), rgba(255, 255, 255, ${rightBrightness}) 100%)
        `;
        edgeGlow.style.opacity = '1';
    };

    const updateShineEffect = (x: number, y: number) => {
      const dims = getElementDimensions();
      mainShine.style.width = `${dims.shineSize}px`;
      mainShine.style.height = `${dims.shineSize}px`;
      mainShine.style.left = `${x}px`;
      mainShine.style.top = `${y}px`;
      mainShine.style.background = `radial-gradient(circle, 
        rgba(255, 255, 255, 0.4) 0%, 
        rgba(255, 255, 255, 0.35) 15%,
        rgba(255, 255, 255, 0.18) 30%,
        rgba(255, 255, 255, 0.08) 45%,
        transparent 60%
      )`;
      mainShine.style.filter = 'blur(8px)';
      (mainShine.style as any).webkitFilter = 'blur(8px)';
      mainShine.style.opacity = '1';
      updateEdgeGlow(x / dims.width, y / dims.height);
      update3DTilt(x / dims.width, y / dims.height);
    };

    element.addEventListener('mousemove', (e) => {
      const mouseEvent = e as MouseEvent;
      const rect = (mouseEvent.currentTarget as Element).getBoundingClientRect();
      const x = mouseEvent.clientX - rect.left;
      const y = mouseEvent.clientY - rect.top;
      updateShineEffect(x, y);
    });

    element.addEventListener('mouseleave', () => {
      mainShine.style.opacity = '0';
      edgeGlow.style.opacity = '0';
      (element as HTMLElement).style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)';
    });

    element.addEventListener('mouseenter', (e) => {
      const mouseEvent = e as MouseEvent;
      const rect = (mouseEvent.currentTarget as Element).getBoundingClientRect();
      const x = mouseEvent.clientX - rect.left;
      const y = mouseEvent.clientY - rect.top;
      updateShineEffect(x, y);
    });
  }
}

const glassEffect = new GlassEffect();

// 自动初始化
if (typeof window !== 'undefined') {
  setupAutoGlassEffect();
}

// 为所有玻璃态元素自动添加反光效果
export function setupAutoGlassEffect() {
  return glassEffect.init();
}
