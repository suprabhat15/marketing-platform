export async function register() {
  // Only run on Node.js runtime (not edge).
  // Load Queue producers only — Workers run in a separate process (worker.ts).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/queue-client');
  }
}
