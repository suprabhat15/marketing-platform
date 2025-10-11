#!/usr/bin/env node

/**
 * Redis Queue Worker for Campaign Processing
 * This worker processes campaign, batch, and email queues
 * Run this script to start processing queued campaigns
 */

import { campaignQueue, batchQueue, emailQueue, campaignWorker, batchWorker, emailWorker } from '../lib/queue.js';

console.log('🚀 Starting MailPackr Queue Worker...');


// Initialize worker
async function startWorker() {
  try {

    console.log('\n✅ Queue Worker is ready and processing jobs...');
    console.log('📧 Email Queue: Processing up to 5 concurrent jobs');
    console.log('📦 Batch Queue: Processing 1 job at a time');
    console.log('🚀 Campaign Queue: Processing 1 job at a time');
    console.log('\n⚡ Press Ctrl+C to stop the worker\n');

    // Log worker activity
    campaignWorker.on('active', (job) => {
      console.log(`🚀 [Campaign] Processing: ${job.data.campaignId}`);
    });

    campaignWorker.on('completed', (job) => {
      console.log(`✅ [Campaign] Completed: ${job.data.campaignId}`);
    });

    campaignWorker.on('failed', (job, err) => {
      console.log(`❌ [Campaign] Failed: ${job?.data?.campaignId} - ${err.message}`);
    });

    batchWorker.on('active', (job) => {
      console.log(`📦 [Batch] Processing: Campaign ${job.data.campaignId}, Batch ${job.data.batchNumber}/${job.data.totalBatches}`);
    });

    batchWorker.on('completed', (job) => {
      console.log(`✅ [Batch] Completed: Campaign ${job.data.campaignId}, Batch ${job.data.batchNumber}/${job.data.totalBatches}`);
    });

    batchWorker.on('failed', (job, err) => {
      console.log(`❌ [Batch] Failed: Campaign ${job?.data?.campaignId}, Batch ${job?.data?.batchNumber} - ${err.message}`);
    });

    emailWorker.on('active', (job) => {
      console.log(`📧 [Email] Sending: ${job.data.email} (Campaign: ${job.data.campaignId})`);
    });

    emailWorker.on('completed', (job) => {
      console.log(`✅ [Email] Sent: ${job.data.email}`);
    });

    emailWorker.on('failed', (job, err) => {
      console.log(`❌ [Email] Failed: ${job?.data?.email} - ${err.message}`);
    });


  } catch (error) {
    console.error('❌ Failed to start queue worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down worker gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    emailQueue.close(),
    campaignWorker.close(),
    batchWorker.close(),
    emailWorker.close()
  ]);
  console.log('✅ Queue worker shut down successfully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT (Ctrl+C), shutting down worker gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    emailQueue.close(),
    campaignWorker.close(),
    batchWorker.close(),
    emailWorker.close()
  ]);
  console.log('✅ Queue worker shut down successfully');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the worker
startWorker();