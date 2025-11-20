// functions/models/order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    stripeCustomerId: { type: String, required: true },
    stripePaymentIntentId: { type: String, required: true, unique: true },
    accessCode: { type: String, required: true, unique: true }, // The unique code for Twilio/ElevenLabs
    fulfillmentStatus: { type: String, default: 'PENDING_PAYMENT' }, // Tracks state
    
    // Personalization Data
    childName: { type: String, required: true },
    childWish: { type: String, required: true },
    childDeed: { type: String, required: true },

    // Parent/Contact Data
    parentEmail: { type: String, required: true },
    parentPhone: { type: String, required: true },
    
    // Financial Data
    packageId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    currency: { type: String, default: 'USD' }
}, { timestamps: true });

// Check if the model already exists before compiling
module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);