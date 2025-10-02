import Redis, { type RedisOptions} from 'ioredis';

class RedisConnection {
  private static instance: any | null = null;

  public static getInstance(): any {
    if (!RedisConnection.instance) {
      const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
      const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
      const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
      const REDIS_USERNAME = process.env.REDIS_USERNAME;
      
      RedisConnection.instance = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        username: REDIS_USERNAME,
        password: REDIS_PASSWORD,
      });

      RedisConnection.instance.on('error', (error: any) => {
        console.error('Redis connection error:', error);
      });

      RedisConnection.instance.on('connect', () => {
        console.log('Connected to Redis');
      });

      RedisConnection.instance.on('ready', () => {
        console.log('Redis connection ready');
      });

      RedisConnection.instance.on('close', () => {
        console.log('Redis connection closed');
      });
    }

    return RedisConnection.instance;
  }

  public static async disconnect(): Promise<void> {
    if (RedisConnection.instance) {
      await RedisConnection.instance.quit();
      RedisConnection.instance = null;
    }
  }
}

export const redis = RedisConnection.getInstance();
export type redisOptions = RedisOptions;
export default RedisConnection;