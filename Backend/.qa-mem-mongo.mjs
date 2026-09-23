// Keeps an in-memory MongoDB replica set alive for local QA. Prints its URI.
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: 27099 }],
});
console.log('MONGO_URI=' + replSet.getUri('warehouses'));
process.on('SIGINT', async () => { await replSet.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
