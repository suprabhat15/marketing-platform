#!/usr/bin/env node

/**
 * Setup script for SES email tracking with SNS
 * Run this script to configure SES Configuration Set and SNS topics for email tracking
 */

import pkg from '@aws-sdk/client-ses';
const { SESClient, CreateConfigurationSetCommand, PutConfigurationSetEventDestinationCommand, DescribeConfigurationSetCommand } = pkg;
import snsPkg from '@aws-sdk/client-sns';
const { SNSClient, CreateTopicCommand, GetTopicAttributesCommand, SetTopicAttributesCommand } = snsPkg;

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const snsClient = new SNSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CONFIGURATION_SET_NAME = process.env.AWS_SES_CONFIGURATION_SET;

async function createSNSTopic(name) {
  try {
    const createCommand = new CreateTopicCommand({ Name: name });
    const result = await snsClient.send(createCommand);
    console.log(`✓ Created SNS topic: ${name} - ${result.TopicArn}`);
    
    // Set topic policy to allow SES to publish
    const policyCommand = new SetTopicAttributesCommand({
      TopicArn: result.TopicArn,
      AttributeName: 'Policy',
      AttributeValue: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowSESPublish',
            Effect: 'Allow',
            Principal: { Service: 'ses.amazonaws.com' },
            Action: 'SNS:Publish',
            Resource: result.TopicArn,
            Condition: {
              StringEquals: {
                'AWS:SourceAccount': process.env.AWS_ACCOUNT_ID
              }
            }
          }
        ]
      })
    });
    
    await snsClient.send(policyCommand);
    console.log(`✓ Set SNS topic policy for SES access`);
    
    return result.TopicArn;
  } catch (error) {
    if (error.name === 'TopicLimitExceeded') {
      // Topic might already exist, try to get it
      try {
        const getCommand = new GetTopicAttributesCommand({ 
          TopicArn: `arn:aws:sns:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:${name}` 
        });
        const result = await snsClient.send(getCommand);
        console.log(`✓ Using existing SNS topic: ${name}`);
        return result.Attributes.TopicArn;
      } catch (getError) {
        console.error(`Error getting existing topic ${name}:`, getError.message);
        throw getError;
      }
    } else {
      console.error(`Error creating SNS topic ${name}:`, error.message);
      throw error;
    }
  }
}

async function createConfigurationSet() {
  try {
    // Try to get existing configuration set first
    try {
      await sesClient.send(new DescribeConfigurationSetCommand({ 
        ConfigurationSetName: CONFIGURATION_SET_NAME 
      }));
      console.log(`✓ Configuration set ${CONFIGURATION_SET_NAME} already exists`);
    } catch (error) {
      if (error.name === 'NotFoundException') {
        // Create new configuration set
        await sesClient.send(new CreateConfigurationSetCommand({
          ConfigurationSetName: CONFIGURATION_SET_NAME,
        }));
        console.log(`✓ Created SES configuration set: ${CONFIGURATION_SET_NAME}`);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error with configuration set:', error.message);
    throw error;
  }
}

async function setupEventDestinations() {
  // Create SNS topics for different event types
  const topics = {
    'mailpackr-bounce-complaints': await createSNSTopic('mailpackr-bounce-complaints'),
    'mailpackr-delivery-opens-clicks': await createSNSTopic('mailpackr-delivery-opens-clicks'),
  };

  // Configure event destinations
  const eventDestinations = [
    {
      Name: 'bounce-complaint-events',
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ['bounce', 'complaint'],
        SnsDestination: {
          TopicArn: topics['mailpackr-bounce-complaints']
        }
      }
    },
    {
      Name: 'delivery-engagement-events', 
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ['delivery', 'open', 'click'],
        SnsDestination: {
          TopicArn: topics['mailpackr-delivery-opens-clicks']
        }
      }
    }
  ];

  for (const destination of eventDestinations) {
    try {
      await sesClient.send(new PutConfigurationSetEventDestinationCommand({
        ConfigurationSetName: CONFIGURATION_SET_NAME,
        EventDestinationName: destination.Name,
        EventDestination: destination.EventDestination
      }));
      console.log(`✓ Created event destination: ${destination.Name}`);
    } catch (error) {
      if (error.name === 'AlreadyExistsException') {
        console.log(`✓ Event destination ${destination.Name} already exists`);
      } else {
        console.error(`Error creating event destination ${destination.Name}:`, error.message);
        throw error;
      }
    }
  }

  return topics;
}

async function main() {
  try {
    console.log('🚀 Setting up SES email tracking infrastructure...\n');

    if (!process.env.AWS_ACCOUNT_ID) {
      throw new Error('AWS_ACCOUNT_ID environment variable is required');
    }

    await createConfigurationSet();
    const topics = await setupEventDestinations();

    console.log('\n✅ Setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Subscribe your webhook endpoint to these SNS topics:');
    Object.entries(topics).forEach(([name, arn]) => {
      console.log(`   - ${name}: ${arn}`);
    });
    console.log('\n2. Make sure your .env file has:');
    console.log(`   AWS_SES_CONFIGURATION_SET=${CONFIGURATION_SET_NAME}`);
    console.log(`   AWS_ACCOUNT_ID=${process.env.AWS_ACCOUNT_ID}`);
    console.log('\n3. Deploy your webhook endpoint to handle SNS notifications');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the main function when called directly
main();