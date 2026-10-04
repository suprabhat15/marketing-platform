import { prisma } from '../lib/prisma';

// Read-only diagnostics: never prints connection strings or customer data.
try {
  const location = await prisma.$queryRaw<
    Array<{ database: string; schema: string }>
  >`
    SELECT current_database() AS database, current_schema() AS schema
  `;
  const tables = await prisma.$queryRaw<
    Array<{ schemaname: string; tablename: string }>
  >`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, tablename
  `;
  console.log(JSON.stringify({ location, tables }, null, 2));
  const schema = location[0]?.schema;
  if (!schema) throw new Error('Database connection has no current schema');

  // Verify model access too, so the diagnosis does not rely solely on catalog
  // introspection. Counts expose no customer records and perform no writes.
  const modelChecks = await Promise.all(
    [
      { model: 'user', count: () => prisma.user.count() },
      { model: 'subscriber', count: () => prisma.subscriber.count() },
      { model: 'subscription', count: () => prisma.subscription.count() },
      { model: 'credit_balance', count: () => prisma.creditBalance.count() },
      { model: 'credit_ledger', count: () => prisma.creditLedger.count() },
      { model: 'email_credit_delivery', count: () => prisma.emailCreditDelivery.count() },
    ].map(async ({ model, count }) => {
      try {
        return { model, rows: await count() };
      } catch (error) {
        return { model, queryErrorCode: (error as { code?: string }).code };
      }
    })
  );
  console.log(JSON.stringify({ modelChecks }, null, 2));

  const required = [
    'user',
    'subscription',
    'order',
    'credit_balance',
    'credit_ledger',
    'email_credit_delivery',
  ];
  const missing = required.filter(
    (name) =>
      !tables.some(
        (table) => table.schemaname === schema && table.tablename === name
      )
  );
  console.log(JSON.stringify({ missingBillingTables: missing }, null, 2));

  if (
    tables.some(
      (table) =>
        table.schemaname === schema &&
        table.tablename === '_prisma_migrations'
    )
  ) {
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations" ORDER BY started_at
    `;
    console.log(JSON.stringify({ migrations }, null, 2));
  } else {
    console.log(
      `No ${schema}._prisma_migrations table: migration history is absent.`
    );
  }
  if (missing.length > 0 || modelChecks.some((check) => 'queryErrorCode' in check)) {
    process.exitCode = 1;
  }
} catch (error) {
  // Report code and message without exposing credentials from a connection URL.
  const details = error as { code?: string; message?: string };
  console.error(
    JSON.stringify({
      code: details.code,
      message: details.message?.replace(
        /(?:prisma(?:\+postgres)?|postgres(?:ql)?):\/\/\S+/g,
        '[database URL redacted]'
      ),
    })
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
