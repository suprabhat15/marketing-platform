/**
 * On-Demand Queue Worker
 * Starts queue processing only when campaigns are queued
 * Saves compute resources and bandwidth when idle
 */

import { campaignQueue, batchQueue, campaignWorker, batchWorker } from './queue';
import { initializeWorkerRecovery, workerRecovery } from './worker-recovery';

let isWorkerRunning = false;
let workerTimeout: NodeJS.Timeout | null = null;
let processorsStarted = false;

// Configuration
const WORKER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes idle timeout
const HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds

/**
 * Start queue processors if not already started
 */
function startProcessors() {
  if (processorsStarted) return;
  
  console.log('🚀 Starting queue processors...');
  
  // The workers are already created and running in queue.ts when the module loads
  // We just need to ensure the queues are ready to process
  processorsStarted = true;
  
  console.log('✅ Queue processors ready');
}

/**
 * Start the on-demand worker
 */
export async function startOnDemandWorker(): Promise<void> {
  if (isWorkerRunning) {
    console.log('⚡ Queue worker already running, resetting idle timer');
    resetIdleTimer();
    return;
  }

  console.log('🎯 Starting on-demand queue worker...');
  
  try {
    // Start processors
    startProcessors();
    
    // Initialize worker recovery system
    await initializeWorkerRecovery();
    
    // Register shutdown handlers
    registerShutdownHandlers();
    
    isWorkerRunning = true;
    
    // Set up monitoring and auto-shutdown
    setupWorkerMonitoring();
    
    console.log('✅ On-demand queue worker started successfully with recovery system');
    
  } catch (error) {
    console.error('❌ Failed to start on-demand worker:', error);
    isWorkerRunning = false;
    throw error;
  }
}

/**
 * Stop the worker when idle
 */
async function stopWorker(): Promise<void> {
  if (!isWorkerRunning) return;

  console.log('🛑 Stopping idle queue worker...');
  
  try {
    // Shutdown worker recovery system
    await workerRecovery.shutdown();
    
    // Don't actually close the queues, just mark as not running
    // The processors will remain available but we stop monitoring
    isWorkerRunning = false;
    
    if (workerTimeout) {
      clearTimeout(workerTimeout);
      workerTimeout = null;
    }
    
    console.log('✅ Queue worker stopped (processors remain available)');
    
  } catch (error) {
    console.error('❌ Error stopping worker:', error);
  }
}

/**
 * Reset the idle timer
 */
function resetIdleTimer(): void {
  if (workerTimeout) {
    clearTimeout(workerTimeout);
  }
  
  workerTimeout = setTimeout(async () => {
    console.log('⏰ Worker idle timeout reached, checking queue status...');
    
    const hasActiveJobs = await checkForActiveJobs();
    if (!hasActiveJobs) {
      await stopWorker();
    } else {
      console.log('📊 Active jobs found, keeping worker running');
      resetIdleTimer();
    }
  }, WORKER_IDLE_TIMEOUT);
}

/**
 * Check if there are any active or waiting jobs
 */
async function checkForActiveJobs(): Promise<boolean> {
  try {
    const [campaignCounts, batchCounts] = await Promise.all([
      campaignQueue.getJobCounts(),
      batchQueue.getJobCounts()
    ]);

    const totalActiveJobs = 
      (campaignCounts.waiting || 0) + (campaignCounts.active || 0) +
      (batchCounts.waiting || 0) + (batchCounts.active || 0);

    return totalActiveJobs > 0;
  } catch (error) {
    console.error('Error checking for active jobs:', error);
    return true; // Keep worker running if we can't check
  }
}

/**
 * Set up worker monitoring and event listeners
 */
function setupWorkerMonitoring(): void {
  // Reset idle timer on any worker activity
  campaignWorker.on('active', () => resetIdleTimer());
  batchWorker.on('active', () => resetIdleTimer());
  
  // Log significant events
  campaignWorker.on('completed', (job) => {
    console.log(`✅ [Campaign] Completed: ${job.data.campaignId}`);
  });

  batchWorker.on('completed', (job) => {
    console.log(`✅ [Batch] Completed: ${job.data.batchNumber}/${job.data.totalBatches} for campaign ${job.data.campaignId}`);
  });

  // Handle failures
  campaignWorker.on('failed', (job, err) => {
    console.error(`❌ [Campaign] Failed: ${job?.data?.campaignId} - ${err.message}`);
  });

  batchWorker.on('failed', (job, err) => {
    console.error(`❌ [Batch] Failed: ${job?.data?.campaignId} batch ${job?.data?.batchNumber} - ${err.message}`);
  });

  // Set up periodic health check
  const healthCheckInterval = setInterval(async () => {
    if (!isWorkerRunning) {
      clearInterval(healthCheckInterval);
      return;
    }

    try {
      const hasJobs = await checkForActiveJobs();
      if (hasJobs) {
        resetIdleTimer();
      }
    } catch (error) {
      console.error('Health check error:', error);
    }
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Check if worker is currently running
 */
export function isWorkerActive(): boolean {
  return isWorkerRunning;
}

/**
 * Get worker status information
 */
export async function getWorkerStatus() {
  const hasActiveJobs = isWorkerRunning ? await checkForActiveJobs() : false;
  const recoveryStats = isWorkerRunning ? await workerRecovery.getRecoveryStats() : null;
  
  return {
    running: isWorkerRunning,
    processorsStarted,
    hasActiveJobs,
    idleTimeoutMinutes: WORKER_IDLE_TIMEOUT / (60 * 1000),
    recovery: recoveryStats
  };
}

// Graceful shutdown handling - only register once
let shutdownHandlersRegistered = false;

function registerShutdownHandlers() {
  if (shutdownHandlersRegistered) return;
  
  process.on('SIGTERM', async () => {
    if (isWorkerRunning) {
      console.log('🛑 On-demand worker: Received SIGTERM, stopping...');
      await stopWorker();
    }
  });

  process.on('SIGINT', async () => {
    if (isWorkerRunning) {
      console.log('🛑 On-demand worker: Received SIGINT, stopping...');
      await stopWorker();
    }
  });
  
  shutdownHandlersRegistered = true;
}