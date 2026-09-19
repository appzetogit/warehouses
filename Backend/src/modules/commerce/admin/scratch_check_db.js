import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../../../.env') });

async function checkData() {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const PageContent = mongoose.model('PageContent', new mongoose.Schema({}, { strict: false, collection: 'page_contents' }));

        const allDocs = await PageContent.find({});
        console.log('Found', allDocs.length, 'documents:');
        allDocs.forEach(doc => {
            console.log(`Key: ${doc.key}, Module: ${doc.module}, ID: ${doc._id}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
