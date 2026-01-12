// Main queue.ts - Central export point for all queue functionality
// This file imports and re-exports from segregated queue files for better organization

// ----------------- Email Sending Queues & Workers -----------------
export {
  // Queues
  campaignQueue,
  batchQueue,
  batchDlqQueue,
  polarIngestionQueue,

  // Workers
  campaignWorker,
  batchWorker,
  emailWorker,
  polarIngestionWorker,

  // Functions
  addCampaignToQueue,
  addPolarIngestionJob,
  shutdownEmailQueues,
} from './email-queues';

// ----------------- Queue Helper Functions -----------------
export {
  checkCampaignCompletion,
  markCampaignComplete,
  retryFailedBatches,
  retryFailedEmailsFromDLQ,
  updateDlqEmailInRedis,
  getDlqEmailsFromRedis,
  getDlqStats,
} from './queue-helpers';

// ----------------- Unified Graceful Shutdown -----------------
export const shutdown = async () => {
  console.log('👋 Closing all queues/workers/integrations...');

  const { shutdownEmailQueues } = await import('./email-queues');
  await Promise.all([shutdownEmailQueues()]);
  console.log('✅ All queues and workers closed');
};

// Process event listeners for graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
