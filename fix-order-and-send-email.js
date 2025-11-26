// Quick script to fix the existing order and send the email
// Run with: node fix-order-and-send-email.js

const mongoose = require('mongoose');
const Order = require('./functions/models/order');
require('dotenv').config();

async function fixOrder() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
            family: 4,
        });

        const orderId = '6926839919fe4eb2cf56b630';
        const order = await Order.findById(orderId);

        if (!order) {
            console.error('Order not found');
            return;
        }

        console.log('Found order:', order._id);
        console.log('Current status:', order.fulfillmentStatus);

        // Update status
        order.fulfillmentStatus = 'PAYMENT_COMPLETED';
        await order.save();

        console.log('✅ Order status updated to PAYMENT_COMPLETED');

        // Send email
        const emailFunction = require('./functions/send-confirmation-email');
        const emailResult = await emailFunction.handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                order_id: orderId,
                email_type: 'live_call_confirmation'
            })
        }, { callbackWaitsForEmptyEventLoop: false });

        console.log('Email result:', emailResult);

        if (emailResult.statusCode === 200) {
            console.log('✅ Email sent successfully to', order.parentEmail);
        } else {
            console.error('❌ Failed to send email:', emailResult.body);
        }

        await mongoose.disconnect();
        console.log('\n✅ Done!');

    } catch (error) {
        console.error('Error:', error);
    }
}

fixOrder();
