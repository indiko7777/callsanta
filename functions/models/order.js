// functions/models/order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    stripeCustomerId: { type: String, required: true },
    stripePaymentIntentId: { type: String, required: true, unique: true },
    accessCode: { type: String, unique: true, sparse: true }, // Unique code, sparse allows nulls/missing
    fulfillmentStatus: { type: String, default: 'PENDING_PAYMENT' }, // Tracks state

    // Personalization Data
    children: [{
        name: { type: String, required: true },
        wish: { type: String, required: true },
        deed: { type: String, required: true }
    }],

    // Parent/Contact Data
    parentEmail: { type: String, required: true },
    parentPhone: { type: String, required: true },

    // Financial Data
    packageId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    overageOption: { type: String, enum: ['auto_disconnect', 'overage_accepted', 'unlimited'], default: 'auto_disconnect' },

    // Video Generation Data
    videoStatus: { type: String, default: 'pending' }, // pending, processing, completed, failed
    videoUrl: { type: String },
    didId: { type: String }, // D-ID Talk ID for polling (legacy)
    heygenVideoId: { type: String }, // HeyGen Video ID for polling
    errorMessage: { type: String }, // Error message if video generation fails

    // Call Data (from ElevenLabs)
    conversationId: { type: String }, // ElevenLabs conversation ID
    audioUrl: { type: String }, // Call recording URL from ElevenLabs
    transcript: { type: String }, // Full conversation transcript
    callDuration: { type: Number }, // Duration in seconds

    // Email Tracking
    emailsSent: [{
        emailType: { type: String, required: true }, // 'confirmation', 'video_delivery', 'post_call'
        sentAt: { type: Date, default: Date.now },
        recipient: { type: String, required: true }
    }],

    // Upgrade Tracking
    hasRecordingUpgrade: { type: Boolean, default: false },
    hasBundleUpgrade: { type: Boolean, default: false },
    hasReturnCallUpgrade: { type: Boolean, default: false },

    // Return Call Specific
    returnCallAccessCode: { type: String, sparse: true }, // New access code for return call
    returnCallUsed: { type: Boolean, default: false },
    returnCallAgentId: { type: String, default: 'agent_4101kb0yxw0zf15t6r2by1g684nb' },

    // Reference to original order (for upgrade orders)
    originalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    upgradeType: { type: String, enum: ['bundle', 'recording', 'return_call'] }
}, { timestamps: true });

// TTL Index: Automatically delete orders that are still 'PENDING_PAYMENT' after 1 hour (3600 seconds)
OrderSchema.index({ createdAt: 1 }, {
    expireAfterSeconds: 3600,
    partialFilterExpression: { fulfillmentStatus: 'PENDING_PAYMENT' }
});

// Check if the model already exists before compiling
module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);