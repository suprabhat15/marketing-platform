import fs from 'node:fs';

const CONFIG = {
  url: 'https://app.mailpackr.com/domains',
  requests: 5000,
  delayMs: 5,
  logFile: 'requests.log'
};

const logStream = fs.createWriteStream(CONFIG.logFile, { flags: 'a' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runLoadTest() {
  const startTime = new Date();
  console.log(`Start Time: ${startTime.toISOString()}`);
  console.log(`Starting load test on ${CONFIG.url}`);
  console.log(`Total Requests: ${CONFIG.requests} | Delay: ${CONFIG.delayMs}ms`);

  for (let i = 1; i <= CONFIG.requests; i++) {
    const start = Date.now();
    try {
      const response = await fetch(CONFIG.url);
      const latency = Date.now() - start;
      
      const logEntry = `${new Date().toISOString()} | Request #${i} | Status: ${response.status} | Latency: ${latency}ms\n`;
      logStream.write(logEntry);
      
      process.stdout.write(`\rProgress: ${i}/${CONFIG.requests} - Last Latency: ${latency}ms`);
    } catch (error) {
      const latency = Date.now() - start;
      const logEntry = `${new Date().toISOString()} | Request #${i} | Error: ${error.message} | Latency: ${latency}ms\n`;
      logStream.write(logEntry);
    }

    await sleep(CONFIG.delayMs);
  }

  const endTime = new Date();
  const durationMs = endTime - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);

  console.log(`\nEnd Time: ${endTime.toISOString()}`);
  console.log(`Total Duration: ${durationSec}s`);
  console.log(`Load test complete. Results saved to ${CONFIG.logFile}`);
  logStream.end();
}

runLoadTest();
