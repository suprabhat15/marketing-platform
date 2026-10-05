import { polar } from './polar-client';

export interface CreateCustomerData {
  email: string;
  name?: string;
  userId: string;
}

export interface BillingCustomer {
  id: string;
  email: string | null;
  name: string | null;
}

export interface BillingSubscription {
  id: string;
  status: string;
  amount: number;
  currency: string;
  recurringInterval: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  productName: string;
  productId: string;
}

export interface BillingOrder {
  id: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  currency: string;
  billingReason: string;
  productName: string;
  paid: boolean;
}

export interface BillingMeter {
  id: string;
  meterName: string;
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
}

export interface BillingPortalData {
  customer: BillingCustomer | null;
  subscriptions: BillingSubscription[];
  orders: BillingOrder[];
  meters: BillingMeter[];
  customerPortalUrl: string | null;
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
      const { statusCode, error } = getError as { statusCode?: number; error?: string };

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
    });

    return customer;
  } catch (error) {
    console.error('Error creating/getting Polar customer:', error);
    throw new Error('Failed to create or get customer');
  }
}

export async function createCustomerSession(customerId: string) {
  try {
    const session = await polar.customerSessions.create({
      customerId,
    });
    return session;
  } catch (error: any) {
    console.error('Error creating customer session:', JSON.stringify(error, null, 2));
    const statusCode = error?.statusCode ?? error?.status;
    if (statusCode === 404 || statusCode === 422) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    throw error;
  }
}

export async function createCustomerSessionByExternalId(externalUserId: string) {
  const session = await polar.customerSessions.create({
    externalCustomerId: externalUserId,
  });
  return session;
}

export async function getCustomerPortalData(
  polarCustomerId: string | null,
  externalUserId: string,
): Promise<BillingPortalData> {
  // Create session using externalCustomerId — bypasses stale polarCustomerId in DB
  const session = await createCustomerSessionByExternalId(externalUserId);
  const security = { customerSession: session.token };

  const ordersPromise = polarCustomerId
    ? polar.orders.list({ customerId: polarCustomerId, limit: 100 })
    : Promise.reject(new Error('no-polar-id'));

  const [subscriptionsResult, ordersResult, metersResult] = await Promise.allSettled([
    polar.subscriptions.list({ externalCustomerId: externalUserId, limit: 100 }),
    ordersPromise,
    polar.customerPortal.customerMeters.list(security, { limit: 100 }),
  ]);

  const subscriptions: BillingSubscription[] =
    subscriptionsResult.status === 'fulfilled'
      ? (subscriptionsResult.value.result.items ?? []).map((s) => ({
          id: s.id,
          status: s.status,
          amount: s.amount,
          currency: s.currency,
          recurringInterval: s.recurringInterval,
          currentPeriodStart: s.currentPeriodStart.toISOString(),
          currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
          productName: s.product.name,
          productId: s.product.id,
        }))
      : [];

  const orders: BillingOrder[] =
    ordersResult.status === 'fulfilled'
      ? (ordersResult.value.result.items ?? []).map((o) => ({
          id: o.id,
          createdAt: o.createdAt.toISOString(),
          status: o.status,
          totalAmount: o.totalAmount,
          currency: o.currency,
          billingReason: o.billingReason,
          productName: o.product?.name ?? 'Unknown',
          paid: o.paid,
        }))
      : [];

  const meters: BillingMeter[] =
    metersResult.status === 'fulfilled'
      ? (metersResult.value.result.items ?? []).map((m) => ({
          id: m.id,
          meterName: m.meter.name,
          consumedUnits: m.consumedUnits,
          creditedUnits: m.creditedUnits,
          balance: m.balance,
        }))
      : [];

  return { customer: null, subscriptions, orders, meters, customerPortalUrl: session.customerPortalUrl ?? null };
}
