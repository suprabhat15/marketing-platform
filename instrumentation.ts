export async function register() {
  // Only run on Node.js runtime (not edge), and only start workers server-side.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/email-queues');
  }
}
