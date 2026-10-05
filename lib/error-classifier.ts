interface ErrorClassification {
  type: 'permanent' | 'temporary' | 'rate_limit' | 'unknown';
  message: string;
  shouldSuppress: boolean;
}

interface ErrorHandlingResult {
  classified: ErrorClassification;
  shouldRetry: boolean;
  suppressionAdded: boolean;
  retryDelay?: number;
}

export class EmailErrorClassifier {
  async handleEmailError(
    error: { code: string; message: string },
    email: string,
    campaignId: string,
    subscriberId: string
  ): Promise<ErrorHandlingResult> {
    const classification = this.classifyError(error);
    
    let suppressionAdded = false;
    
    // Handle permanent bounces by adding to suppression list
    if (classification.shouldSuppress) {
      try {
        await this.addToSuppressionList(email, campaignId, subscriberId, classification.message);
        suppressionAdded = true;
      } catch (suppressionError) {
        console.error('Failed to add to suppression list:', suppressionError);
      }
    }
    
    return {
      classified: classification,
      shouldRetry: classification.type === 'temporary' && !suppressionAdded,
      suppressionAdded,
      retryDelay: this.getRetryDelay(classification.type)
    };
  }
  
  private classifyError(error: { code: string; message: string }): ErrorClassification {
    const code = error.code.toLowerCase();
    const message = error.message.toLowerCase();
    
    // Permanent bounces
    if (code.includes('invalidrecipient') || 
        code.includes('messagerejected') ||
        message.includes('invalid recipient') ||
        message.includes('mailbox does not exist') ||
        message.includes('user unknown') ||
        message.includes('no such user')) {
      return {
        type: 'permanent',
        message: error.message,
        shouldSuppress: true
      };
    }
    
    // Rate limiting
    if (code.includes('throttling') || 
        code.includes('rate') ||
        message.includes('throttling') ||
        message.includes('rate limit')) {
      return {
        type: 'rate_limit',
        message: error.message,
        shouldSuppress: false
      };
    }
    
    // Temporary errors
    if (code.includes('serviceunavailable') ||
        code.includes('timeout') ||
        message.includes('temporary') ||
        message.includes('try again')) {
      return {
        type: 'temporary',
        message: error.message,
        shouldSuppress: false
      };
    }
    
    // Default to unknown
    return {
      type: 'unknown',
      message: error.message,
      shouldSuppress: false
    };
  }
  
  private getRetryDelay(errorType: string): number {
    switch (errorType) {
      case 'rate_limit':
        return 60000; // 1 minute
      case 'temporary':
        return 30000; // 30 seconds
      default:
        return 60000; // 1 minute default
    }
  }
  
  private async addToSuppressionList(
    email: string, 
    campaignId: string, 
    subscriberId: string, 
    reason: string
  ): Promise<void> {
    // You'll need to implement this based on your suppression list storage
    // This could be a database table, Redis, or external service
    console.log(`Adding ${email} to suppression list: ${reason}`);
    
    // Example implementation - you'll need to adapt this to your system
    try {
      // Update subscriber status to BOUNCED
      const { prisma } = await import('./prisma');
      await prisma.subscriber.update({
        where: { id: subscriberId },
        data: { 
          status: 'BOUNCED',
          // You might want to add a bouncedAt field
        }
      });
      
      // Create a bounce event
      await prisma.event.create({
        data: {
          type: 'BOUNCED',
          data: { 
            email, 
            reason, 
            timestamp: new Date().toISOString() 
          },
          subscriberId,
          campaignId,
        },
      });
    } catch (error) {
      console.error('Failed to update subscriber status:', error);
      throw error;
    }
  }
}

export const emailErrorClassifier = new EmailErrorClassifier();
