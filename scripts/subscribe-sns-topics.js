#!/usr/bin/env node

/**
 * Subscribe SNS topics to the webhook endpoint for email tracking
 * Run this script after setting up the email tracking infrastructure
 */

import { SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import dotenv from 'dotenv';

dotenv.config();

const snsClient = new SNSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/ses`;

async function subscribeTopicToWebhook(topicArn, webhookUrl) {
  try {
    const command = new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: 'https',
      Endpoint: webhookUrl,
    });
    
    const result = await snsClient.send(command);
    console.log(`✓ Subscribed ${topicArn.split(':').pop()} to webhook`);
    console.log(`  Subscription ARN: ${result.SubscriptionArn}`);
    return result.SubscriptionArn;
  } catch (error) {
    console.error(`❌ Failed to subscribe ${topicArn}:`, error.message);
    throw error;
  }
}


async function main() {
  console.log('🚀 Subscribing SNS topics to webhook endpoint...\n');
  
  const topics = [
    { name: 'Bounces', arn: process.env.AWS_SNS_BOUNCE_TOPIC_ARN },
    { name: 'Complaints', arn: process.env.AWS_SNS_COMPLAINT_TOPIC_ARN },
    { name: 'Deliveries', arn: process.env.AWS_SNS_DELIVERY_TOPIC_ARN },
    { name: 'Sends', arn: process.env.AWS_SNS_SEND_TOPIC_ARN },
    { name: 'Opens', arn: process.env.AWS_SNS_OPEN_TOPIC_ARN },
    { name: 'Clicks', arn: process.env.AWS_SNS_CLICK_TOPIC_ARN },
    { name: 'Rejects', arn: process.env.AWS_SNS_REJECT_TOPIC_ARN },
    { name: 'Rendering Failures', arn: process.env.AWS_SNS_RENDERING_FAILURE_TOPIC_ARN },
  ];

  console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

  for (const topic of topics) {
    if (topic.arn) {
      try {
        await subscribeTopicToWebhook(topic.arn, WEBHOOK_URL);
      } catch (error) {
        console.error(`Failed to subscribe ${topic.name}:`, error.message);
      }
    } else {
      console.warn(`⚠️  Missing ARN for ${topic.name}`);
    }
  }

  console.log('\n✅ SNS topic subscription completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Confirm subscriptions by clicking the confirmation links sent to the webhook');
  console.log('2. Test email sending to verify tracking works');
  console.log('3. Check webhook logs for incoming events');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export { main };