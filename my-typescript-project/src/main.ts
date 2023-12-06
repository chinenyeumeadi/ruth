import * as redis from 'redis';
import * as memjs from 'memjs';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

class Cache {
    private redisClient: redis.RedisClient;
    private memcachedClient: memjs.Client;
    private mongoClient: MongoClient;
    private pgPool: Pool;
    private inbuiltCache: Map<string, any>;

    constructor() {
        this.redisClient = redis.createClient({ url: 'redis://localhost:6379' });
        this.memcachedClient = memjs.Client.create('localhost:11211');
        this.mongoClient = new MongoClient('mongodb://localhost:27017');
        this.pgPool = new Pool({ host: 'localhost', port: 5432, database: 'mydb', user: 'myuser', password: 'mypassword' });
        this.inbuiltCache = new Map();

        this.mongoClient.connect().catch(err => console.error('Error connecting to MongoDB:', err));
        this.pgPool.on('error', err => console.error('Error with PostgreSQL pool:', err));
    }

    async set(key: string, value: any, cacheSystem: 'redis' | 'memcached' | 'mongodb' | 'postgresql' | 'inbuilt') {
        const stringValue = JSON.stringify(value);
        if (cacheSystem === 'redis') {
            this.redisClient.set(key, stringValue, err => { if (err) console.error('Error setting value in Redis:', err); });
        } else if (cacheSystem === 'memcached') {
            this.memcachedClient.set(key, stringValue, {}, err => { if (err) console.error('Error setting value in Memcached:', err); });
        } else if (cacheSystem === 'mongodb') {
            const db = this.mongoClient.db('mydb');
            db.collection('cache').updateOne({ _id: key }, { $set: { value: stringValue } }, { upsert: true });
        } else if (cacheSystem === 'postgresql') {
            this.pgPool.query('INSERT INTO cache(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, stringValue]);
        } else if (cacheSystem === 'inbuilt') {
            this.inbuiltCache.set(key, value);
        }
    }

    async get(key: string, cacheSystem: 'redis' | 'memcached' | 'mongodb' | 'postgresql' | 'inbuilt') {
        if (cacheSystem === 'redis') {
            return new Promise((resolve, reject) => {
                this.redisClient.get(key, (err, reply) => {
                    if (err) {
                        console.error('Error getting value from Redis:', err);
                        reject(err);
                    } else {
                        resolve(JSON.parse(reply));
                    }
                });
            });
        } else if (cacheSystem === 'memcached') {
            return new Promise((resolve, reject) => {
                this.memcachedClient.get(key, (err, value) => {
                    if (err) {
                        console.error('Error getting value from Memcached:', err);
                        reject(err);
                    } else {
                        resolve(JSON.parse(value.toString()));
                    }
                });
            });
        } else if (cacheSystem === 'mongodb') {
            const db = this.mongoClient.db('mydb');
            const doc = await db.collection('cache').findOne({ _id: key });
            return doc ? JSON.parse(doc.value) : null;
        } else if (cacheSystem === 'postgresql') {
            const res = await this.pgPool.query('SELECT value FROM cache WHERE key = $1', [key]);
            return res.rows[0] ? JSON.parse(res.rows[0].value) : null;
        } else if (cacheSystem === 'inbuilt') {
            return this.inbuiltCache.get(key);
        }
    }

    close() {
        this.redisClient.quit();
        this.memcachedClient.close();
        this.mongoClient.close();
        this.pgPool.end();
    }
}

(async () => {
    const cache = new Cache();

    // Test Redis
    await cache.set('myKey', { a: 1 }, 'redis');
    console.log(await cache.get('myKey', 'redis'));  // { a: 1 }

    // Test Memcached
    await cache.set('myKey', { b: 2 }, 'memcached');
    console.log(await cache.get('myKey', 'memcached'));  // { b: 2 }

    // Test MongoDB
    await cache.set('myKey', { c: 3 }, 'mongodb');
    console.log(await cache.get('myKey', 'mongodb'));  // { c: 3 }

    // Test PostgreSQL
    await cache.set('myKey', { d: 4 }, 'postgresql');
    console.log(await cache.get('myKey', 'postgresql'));  // { d: 4 }

    // Test inbuilt cache
    await cache.set('myKey', { e: 5 }, 'inbuilt');
    console.log(await cache.get('myKey', 'inbuilt'));  // { e: 5 }

    cache.close();
})();