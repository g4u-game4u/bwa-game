import { Injectable } from '@angular/core';

export interface PerformanceMetrics {
  componentRenderTime: number;
  changeDetectionCycles: number;
  memoryUsage: number;
  bundleSize: number;
}

@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private changeDetectionCount = 0;

  /**
   * Measure component render time
   */
  measureRenderTime(componentName: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      const existingMetrics = this.metrics.get(componentName) || {
        componentRenderTime: 0,
        changeDetectionCycles: 0,
        memoryUsage: 0,
        bundleSize: 0
      };
      
      this.metrics.set(componentName, {
        ...existingMetrics,
        componentRenderTime: renderTime
      });
      
      if (renderTime > 16) { // More than one frame (60fps)
        console.warn(`${componentName} render time: ${renderTime.toFixed(2)}ms (exceeds 16ms threshold)`);
      }
    };
  }

  /**
   * Track change detection cycles
   */
  trackChangeDetection(componentName: string): void {
    this.changeDetectionCount++;
    
    const existingMetrics = this.metrics.get(componentName) || {
      componentRenderTime: 0,
      changeDetectionCycles: 0,
      memoryUsage: 0,
      bundleSize: 0
    };
    
    this.metrics.set(componentName, {
      ...existingMetrics,
      changeDetectionCycles: this.changeDetectionCount
    });
  }

  /**
   * Measure memory usage
   */
  measureMemoryUsage(): number {
    if (typeof window !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      const usedMemory = memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
      return usedMemory;
    }
    return 0;
  }

  /**
   * Get performance metrics for a component
   */
  getMetrics(componentName: string): PerformanceMetrics | undefined {
    return this.metrics.get(componentName);
  }

  /**
   * Get all performance metrics
   */
  getAllMetrics(): Map<string, PerformanceMetrics> {
    return this.metrics;
  }

  /**
   * Log performance report
   */
  logPerformanceReport(): void {
    console.group('Performance Report');
    console.log('Total Change Detection Cycles:', this.changeDetectionCount);
    console.log('Memory Usage:', `${this.measureMemoryUsage().toFixed(2)} MB`);
    
    this.metrics.forEach((metrics, componentName) => {
      console.log(`\n${componentName}:`);
      console.log(`  Render Time: ${metrics.componentRenderTime.toFixed(2)}ms`);
      console.log(`  Change Detection Cycles: ${metrics.changeDetectionCycles}`);
    });
    
    console.groupEnd();
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
    this.changeDetectionCount = 0;
  }
}
