// functions/models/order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    stripeCustomerId: { type: String, required: true },
    stripePaymentIntentId: { type: String, required: true, unique: true },
    accessCode: { type: String, unique: true, sparse: true }, // Unique code, sparse allows nulls/missing
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
    currency: { type: String, default: 'USD' },
    overageOption: { type: String, enum: ['auto_disconnect', 'overage_accepted'], default: 'auto_disconnect' },

    // Video Generation Data
    videoStatus: { type: String, default: 'pending' }, // pending, processing, completed, failed
    videoUrl: { type: String },
    didId: { type: String }, // D-ID Talk ID for polling (legacy)
    heygenVideoId: { type: String } // HeyGen Video ID for polling
}, { timestamps: true });

// Check if the model already exists before compiling
module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);