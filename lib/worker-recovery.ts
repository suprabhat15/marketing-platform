import { redis } from './redis';
import { CampaignProgressTracker } from './campaign-progress';
import { batchQueue } from './queue';

export class WorkerRecoveryManager {
  private readonly workerId: string;
  private readonly heartbeatIntervalMs: number;
  private readonly workerTimeoutMs: number;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    workerId: string = `worker-${process.pid}-${Date.now()}`,
    heartbeatIntervalMs: number = 30000, // 30 seconds
    workerTimeoutMs: number = 120000 // 2 minutes
  ) {
    this.workerId = workerId;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.workerTimeoutMs = workerTimeoutMs;
  }

  private getWorkerKey(workerId: string): string {
    return `worker:${workerId}`;
  }

  private getWorkersSetKey(): string {
    return 'workers:active';
  }

  /**
   * Start the worker and begin heartbeat
   */
  async start(): Promise<void> {
    await this.registerWorker(this.workerId);
    this.startHeartbeat();
    
    // Register cleanup handlers
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    process.on('beforeExit', () => this.shutdown());
  }

  /**
   * Register a worker instance
   */
  async registerWorker(workerId: string, campaignId?: string): Promise<void> {
    const workerKey = this.getWorkerKey(workerId);
    const workersSet = this.getWorkersSetKey();
    
    const workerData = {
      workerId,
      campaignId: campaignId || '',
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      status: 'active'
    };

    await Promise.all([
      redis.hmset(workerKey, workerData),
      redis.expire(workerKey, Math.ceil(this.workerTimeoutMs / 1000)),
      redis.sadd(workersSet, workerId)
    ]);

    console.log(`✅ Worker ${workerId} registered successfully`);
  }

  /**
   * Send heartbeat to indicate worker is alive
   */
  async heartbeat(workerId: string = this.workerId): Promise<void> {
    const workerKey = this.getWorkerKey(workerId);
    
    await Promise.all([
      redis.hset(workerKey, 'lastHeartbeat', new Date().toISOString()),
      redis.expire(workerKey, Math.ceil(this.workerTimeoutMs / 1000))
    ]);
  }

  /**
   * Start automatic heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.heartbeat();
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat and unregister worker
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    await this.unregisterWorker(this.workerId);
  }

  /**
   * Unregister worker
   */
  async unregisterWorker(workerId: string): Promise<void> {
    const workerKey = this.getWorkerKey(workerId);
    const workersSet = this.getWorkersSetKey();
    
    await Promise.all([
      redis.del(workerKey),
      redis.srem(workersSet, workerId)
    ]);

    console.log(`🛑 Worker ${workerId} unregistered`);
  }

  /**
   * Check for failed workers and recover their work
   */
  async recoverFailedWorkers(): Promise<number> {
    const workersSet = this.getWorkersSetKey();
    const activeWorkers = await redis.smembers(workersSet);
    
    if (activeWorkers.length === 0) {
      return 0;
    }

    const failedWorkers: string[] = [];
    const now = Date.now();

    // Check each worker's last heartbeat
    for (const workerId of activeWorkers) {
      const workerKey = this.getWorkerKey(workerId);
      const workerData = await redis.hgetall(workerKey);
      
      if (!workerData || !workerData.lastHeartbeat) {
        failedWorkers.push(workerId);
        continue;
      }

      const lastHeartbeat = new Date(workerData.lastHeartbeat).getTime();
      if (now - lastHeartbeat > this.workerTimeoutMs) {
        failedWorkers.push(workerId);
      }
    }

    // Clean up failed workers
    if (failedWorkers.length > 0) {
      console.log(`🔧 Found ${failedWorkers.length} failed workers, cleaning up...`);
      
      for (const workerId of failedWorkers) {
        await this.unregisterWorker(workerId);
      }
    }

    // Check for stalled batches and re-queue them
    const stalledBatches = await this.findStalledBatches();
    if (stalledBatches.length > 0) {
      console.log(`♻️ Re-queuing ${stalledBatches.length} stalled batches`);
      
      for (const batch of stalledBatches) {
        await batchQueue.add('process-batch', batch.data, {
          delay: Math.random() * 5000 // Random delay to avoid thundering herd
        });
      }
    }

    return failedWorkers.length + stalledBatches.length;
  }

  /**
   * Find batches that may have been interrupted by worker failures
   */
  private async findStalledBatches(): Promise<Array<{ data: any }>> {
    try {
      // Get failed batch jobs from BullMQ
      const failedJobs = await batchQueue.getJobs(['failed']);
      
      return failedJobs.map(job => ({
        data: job.data
      }));
    } catch (error) {
      console.error('Error finding stalled batches:', error);
      return [];
    }
  }

  /**
   * Get status of all workers
   */
  async getWorkerStatus(): Promise<Record<string, any>> {
    const workersSet = this.getWorkersSetKey();
    const activeWorkers = await redis.smembers(workersSet);
    
    const workerStatuses: Record<string, any> = {};
    
    for (const workerId of activeWorkers) {
      const workerKey = this.getWorkerKey(workerId);
      const workerData = await redis.hgetall(workerKey);
      
      if (workerData) {
        const lastHeartbeat = new Date(workerData.lastHeartbeat).getTime();
        const now = Date.now();
        const isHealthy = now - lastHeartbeat < this.workerTimeoutMs;
        
        workerStatuses[workerId] = {
          ...workerData,
          isHealthy,
          lastHeartbeatAge: now - lastHeartbeat
        };
      }
    }
    
    return workerStatuses;
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    activeWorkers: number;
    healthyWorkers: number;
    totalRecoveredBatches: number;
  }> {
    const workerStatuses = await this.getWorkerStatus();
    const activeWorkers = Object.keys(workerStatuses).length;
    const healthyWorkers = Object.values(workerStatuses).filter(
      (status: any) => status.isHealthy
    ).length;

    // Get total recovery count from Redis (if tracking)
    const totalRecoveredBatches = parseInt(
      await redis.get('recovery:total-batches') || '0'
    );

    return {
      activeWorkers,
      healthyWorkers,
      totalRecoveredBatches
    };
  }

  /**
   * Periodic recovery check - should be called regularly
   */
  async performRecoveryCheck(): Promise<void> {
    try {
      const recoveredCount = await this.recoverFailedWorkers();
      
      if (recoveredCount > 0) {
        // Increment total recovery counter
        await redis.incrby('recovery:total-batches', recoveredCount);
        console.log(`🔧 Recovery check completed: ${recoveredCount} items recovered`);
      }
    } catch (error) {
      console.error('Error during recovery check:', error);
    }
  }
}

// Global instance
export const workerRecovery = new WorkerRecoveryManager();

/**
 * Initialize worker recovery system
 */
export async function initializeWorkerRecovery(): Promise<void> {
  await workerRecovery.start();
  
  // Run recovery checks every 2 minutes
  setInterval(async () => {
    await workerRecovery.performRecoveryCheck();
  }, 120000);
  
  console.log('🔧 Worker recovery system initialized');
}