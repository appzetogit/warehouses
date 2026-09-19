import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// A replica set, not a standalone server: the payment code uses Mongo transactions,
// and a standalone mongod refuses them.
let replSet;

export async function startDb() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri(), { dbName: 'test' });
}

export async function stopDb() {
    await mongoose.disconnect();
    await replSet?.stop();
}

export async function clearDb() {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
}
