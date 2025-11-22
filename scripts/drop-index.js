const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("MONGODB_URI is missing in .env");
    process.exit(1);
}

async function dropIndex() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(uri, { family: 4 }); // Force IPv4
        console.log("Connected.");

        const collection = mongoose.connection.collection('orders');

        console.log("Dropping index 'accessCode_1'...");
        try {
            await collection.dropIndex('accessCode_1');
            console.log("Index dropped successfully.");
        } catch (e) {
            if (e.code === 27) {
                console.log("Index not found (already dropped).");
            } else {
                throw e;
            }
        }

        console.log("Done. You can now restart the server.");
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

dropIndex();
