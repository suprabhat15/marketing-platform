import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { getRedisInstance } from './redis';
import { 
  EmailJobData, 
  CampaignJobData, 
  BatchJobData, 
  EmailType, 
  getQueueName, 
  getBatchQueueName, 
  getDlqQueueName,
  QueueMetrics 
} from './queue-types';

interface QueueManagerConfig {
  region: string;
  concurrency: {
    transactional: number;
    marketing: number;
    system: number;
  };
  quotaLimits: {
    transactional: number; // per second
    marketing: number;     // per second
    system: number;        // per second
  };
}

export class QueueManager {
  private static instance: QueueManager;
  private config: QueueManagerConfig;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private isShuttingDown = false;

  private constructor(config: QueueManagerConfig) {
    this.config = config;
    this.initializeQueues();
  }

  public static getInstance(config?: QueueManagerConfig): QueueManager {
    if (!QueueManager.instance) {
      if (!config) {
        // Default configuration
        config = {
          region: 'us-east-1',
          concurrency: {
            transactional: 5,  // High priority, lower concurrency for reliability
            marketing: 10,     // Bulk processing
            system: 2          // Background tasks
          },
          quotaLimits: {
            transactional: 7,  // SES limit divided by email types
            marketing: 15,     // Higher for bulk
            system: 3          // Lower for system tasks
          }
        };
      }
      QueueManager.instance = new QueueManager(config);
    }
    return QueueManager.instance;
  }

  private initializeQueues(): void {
    const emailTypes: EmailType[] = ['transactional', 'marketing', 'system'];
    
    emailTypes.forEach(emailType => {
      this.createEmailQueue(emailType);
      this.createBatchQueue(emailType);
      this.createDlqQueue(emailType);
    });

    // Create campaign orchestrator queue
    this.createCampaignQueue();
  }

  private getQueueOptions(emailType: EmailType): QueueOptions {
    const connection = getRedisInstance('queue');
    
    return {
      connection,
      defaultJobOptions: {
        removeOnComplete: emailType === 'transactional' ? 100 : 50, // Keep more transactional jobs
        removeOnFail: 200, // Keep failed jobs for analysis
        attempts: emailType === 'transactional' ? 5 : 3, // More retries for critical emails
        backoff: {
          type: 'exponential',
          delay: emailType === 'transactional' ? 2000 : 5000
        }
      }
      // Rate limiting is handled at the Worker level, not Queue level
    };
  }

  private createEmailQueue(emailType: EmailType): void {
    const queueName = getQueueName(emailType, this.config.region);
    const queue = new Queue<EmailJobData>(queueName, this.getQueueOptions(emailType));
    
    this.queues.set(`email-${emailType}`, queue);
    
    // Create worker for this queue
    this.createEmailWorker(emailType, queue);
  }

  private createBatchQueue(emailType: EmailType): void {
    const queueName = getBatchQueueName(emailType, this.config.region);
    const queue = new Queue<BatchJobData>(queueName, this.getQueueOptions(emailType));
    
    this.queues.set(`batch-${emailType}`, queue);
    
    // Create worker for this queue
    this.createBatchWorker(emailType, queue);
  }

  private createDlqQueue(emailType: EmailType): void {
    const queueName = getDlqQueueName(emailType, this.config.region);
    const options = this.getQueueOptions(emailType);
    
    // Override options for DLQ
    options.defaultJobOptions = {
      ...options.defaultJobOptions,
      attempts: 1, // No retries in DLQ
      removeOnComplete: 10,
      removeOnFail: 500
    };
    
    const queue = new Queue<any>(queueName, options);
    this.queues.set(`dlq-${emailType}`, queue);
    
    // Create DLQ worker
    this.createDlqWorker(emailType, queue);
  }

  private createCampaignQueue(): void {
    const queueName = `${this.config.region}-campaign-orchestrator`;
    const connection = getRedisInstance('queue');
    
    const queue = new Queue<CampaignJobData>(queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 }
      }
      // Rate limiting is handled at the Worker level, not Queue level
    });
    
    this.queues.set('campaign', queue);
    this.createCampaignWorker(queue);
  }

  private createEmailWorker(emailType: EmailType, queue: Queue<EmailJobData>): void {
    const workerName = `email-worker-${emailType}`;
    const connection = getRedisInstance('worker');
    
    const worker = new Worker<EmailJobData>(
      queue.name,
      async (job: Job<EmailJobData>) => {
        await this.processEmailJob(job);
      },
      {
        connection,
        concurrency: this.config.concurrency[emailType],
        limiter: {
          max: this.config.quotaLimits[emailType],
          duration: 1000
        }
      } as WorkerOptions
    );

    this.setupWorkerEventHandlers(worker, workerName);
    this.workers.set(workerName, worker);
  }

  private createBatchWorker(emailType: EmailType, queue: Queue<BatchJobData>): void {
    const workerName = `batch-worker-${emailType}`;
    const connection = getRedisInstance('worker');
    
    const worker = new Worker<BatchJobData>(
      queue.name,
      async (job: Job<BatchJobData>) => {
        await this.processBatchJob(job);
      },
      {
        connection,
        concurrency: Math.max(1, Math.floor(this.config.concurrency[emailType] / 2)), // Lower concurrency for batches
        limiter: {
          max: Math.floor(this.config.quotaLimits[emailType] / 2),
          duration: 1000
        }
      } as WorkerOptions
    );

    this.setupWorkerEventHandlers(worker, workerName);
    this.workers.set(workerName, worker);
  }

  private createDlqWorker(emailType: EmailType, queue: Queue<any>): void {
    const workerName = `dlq-worker-${emailType}`;
    const connection = getRedisInstance('worker');
    
    const worker = new Worker(
      queue.name,
      async (job: Job<any>) => {
        await this.processDlqJob(job, emailType);
      },
      {
        connection,
        concurrency: 1, // Conservative for DLQ
        limiter: {
          max: 2, // Conservative for DLQ processing
          duration: 1000
        }
      } as WorkerOptions
    );

    this.setupWorkerEventHandlers(worker, workerName);
    this.workers.set(workerName, worker);
  }

  private createCampaignWorker(queue: Queue<CampaignJobData>): void {
    const workerName = 'campaign-worker';
    const connection = getRedisInstance('worker');
    
    const worker = new Worker<CampaignJobData>(
      queue.name,
      async (job: Job<CampaignJobData>) => {
        await this.processCampaignJob(job);
      },
      {
        connection,
        concurrency: 1, // Sequential campaign processing
        limiter: {
          max: 5, // Limit campaign starts per second
          duration: 1000
        }
      } as WorkerOptions
    );

    this.setupWorkerEventHandlers(worker, workerName);
    this.workers.set(workerName, worker);
  }

  private setupWorkerEventHandlers(worker: Worker, workerName: string): void {
    worker.on('completed', (job) => {
      console.log(`✅ ${workerName} completed job ${job.id}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`❌ ${workerName} failed job ${job?.id}:`, err.message);
    });

    worker.on('error', (err) => {
      console.error(`❌ ${workerName} error:`, err);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`⚠️ ${workerName} job ${jobId} stalled`);
    });
  }

  // Job processing methods (to be implemented)
  private async processEmailJob(job: Job<EmailJobData>): Promise<void> {
    console.log(`📧 Processing email job: ${job.id} for ${job.data.to}`);
    // Implementation will be added in next steps
  }

  private async processBatchJob(job: Job<BatchJobData>): Promise<void> {
    console.log(`📦 Processing batch job: ${job.id} for campaign ${job.data.campaignId}`);
    // Implementation will be added in next steps
  }

  private async processDlqJob(job: Job<any>, emailType: EmailType): Promise<void> {
    console.log(`🔄 Processing DLQ job: ${job.id} for ${emailType}`);
    // Implementation will be added in next steps
  }

  private async processCampaignJob(job: Job<CampaignJobData>): Promise<void> {
    console.log(`🎯 Processing campaign job: ${job.id} for campaign ${job.data.campaignId}`);
    // Implementation will be added in next steps
  }

  // Public API methods
  public async addEmailJob(emailData: EmailJobData, emailType: EmailType, priority: number = 0): Promise<Job<EmailJobData>> {
    const queue = this.queues.get(`email-${emailType}`);
    if (!queue) {
      throw new Error(`Email queue for type ${emailType} not found`);
    }

    return await queue.add('send-email', emailData, {
      priority,
      // Add deduplication for transactional emails
      jobId: emailType === 'transactional' ? emailData.emailId : undefined
    });
  }

  public async addCampaignJob(campaignData: CampaignJobData, priority: number = 0): Promise<Job<CampaignJobData>> {
    const queue = this.queues.get('campaign');
    if (!queue) {
      throw new Error('Campaign queue not found');
    }

    return await queue.add('process-campaign', campaignData, {
      priority,
      jobId: `campaign-${campaignData.campaignId}` // Prevent duplicate campaign processing
    });
  }

  public async getQueueMetrics(emailType: EmailType): Promise<QueueMetrics> {
    const emailQueue = this.queues.get(`email-${emailType}`);
    const batchQueue = this.queues.get(`batch-${emailType}`);
    
    if (!emailQueue || !batchQueue) {
      throw new Error(`Queues for type ${emailType} not found`);
    }

    const [emailWaiting, emailActive, emailCompleted, emailFailed] = await Promise.all([
      emailQueue.getWaiting(),
      emailQueue.getActive(),
      emailQueue.getCompleted(),
      emailQueue.getFailed()
    ]);

    const [batchWaiting, batchActive, batchCompleted, batchFailed] = await Promise.all([
      batchQueue.getWaiting(),
      batchQueue.getActive(),
      batchQueue.getCompleted(),
      batchQueue.getFailed()
    ]);

    return {
      totalJobs: emailWaiting.length + emailActive.length + batchWaiting.length + batchActive.length,
      activeJobs: emailActive.length + batchActive.length,
      waitingJobs: emailWaiting.length + batchWaiting.length,
      completedJobs: emailCompleted.length + batchCompleted.length,
      failedJobs: emailFailed.length + batchFailed.length,
      throughputPerSecond: 0 // TODO: Calculate based on completed jobs in last minute
    };
  }

  public async pauseQueue(emailType: EmailType): Promise<void> {
    const emailQueue = this.queues.get(`email-${emailType}`);
    const batchQueue = this.queues.get(`batch-${emailType}`);
    
    if (emailQueue) await emailQueue.pause();
    if (batchQueue) await batchQueue.pause();
    
    console.log(`⏸️ Paused all queues for ${emailType}`);
  }

  public async resumeQueue(emailType: EmailType): Promise<void> {
    const emailQueue = this.queues.get(`email-${emailType}`);
    const batchQueue = this.queues.get(`batch-${emailType}`);
    
    if (emailQueue) await emailQueue.resume();
    if (batchQueue) await batchQueue.resume();
    
    console.log(`▶️ Resumed all queues for ${emailType}`);
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🛑 Shutting down queue manager...');

    // Close all workers first
    const workerPromises = Array.from(this.workers.values()).map(worker => worker.close());
    await Promise.allSettled(workerPromises);

    // Close all queues
    const queuePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.allSettled(queuePromises);

    console.log('✅ Queue manager shutdown complete');
  }
}

// Global instance
let globalQueueManager: QueueManager;

export function getQueueManager(config?: QueueManagerConfig): QueueManager {
  if (!globalQueueManager) {
    globalQueueManager = QueueManager.getInstance(config);
  }
  return globalQueueManager;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (globalQueueManager) {
    await globalQueueManager.shutdown();
  }
});

process.on('SIGINT', async () => {
  if (globalQueueManager) {
    await globalQueueManager.shutdown();
  }
});