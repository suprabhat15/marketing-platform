import { polar } from './polar-client';

// Types for customer
export interface CreateCustomerData {
  email: string;
  name?: string;
  // metadata?: Record<string, string>;
  userId: string;
}

// Create or get customer
export async function createOrGetCustomer(data: CreateCustomerData) {
  try {
    // Check for existing customer first
    try {
      const selectedCustomer = await polar.customers.getStateExternal({
        externalId: data.userId,
      });
      if (selectedCustomer) return selectedCustomer;
    } catch (getError: any) {
      const { statusCode, error } = getError;

      // If customer not found (404), we'll create a new one
      if (statusCode === 404 || error === 'ResourceNotFound') {
        console.log('Customer not found, will create new one');
      } else {
        // If it's a different error, throw it
        throw getError;
      }
    }

    // Create new customer if not found
    const customer = await polar.customers.create({
      email: data?.email,
      name: data?.name,
      externalId: data?.userId,
      // metadata: data?.metadata,
    });

    return customer;
  } catch (error) {
    console.error('Error creating/getting Polar customer:', error);
    throw new Error('Failed to create or get customer');
  }
}

// Create customer session for customer portal
export async function createCustomerSession(customerId: string) {
  try {
    const session = await polar.customerSessions.create({
      customerId,
    });
    return session;
  } catch (error) {
    console.error('Error creating customer session:', error);
    throw new Error('Failed to create customer session');
  }
}
