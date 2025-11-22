const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("MONGODB_URI is missing in .env");
    process.exit(1);
}

async function fixIndexes() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(uri, { family: 4 });
        console.log("Connected.");

        const collection = mongoose.connection.collection('orders');

        console.log("Listing current indexes:");
        const indexes = await collection.indexes();
        console.log(JSON.stringify(indexes, null, 2));

        const indexName = 'accessCode_1';
        const indexExists = indexes.some(idx => idx.name === indexName);

        if (indexExists) {
            console.log(`Found index '${indexName}'. Dropping it...`);
            await collection.dropIndex(indexName);
            console.log("Index dropped.");
        } else {
            console.log(`Index '${indexName}' not found.`);
        }

        console.log("Done. Please restart your application to let Mongoose recreate the index with sparse: true.");
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

fixIndexes();
