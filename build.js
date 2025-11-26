// build.js
// Build script for Netlify deployment
// Replaces placeholder Stripe key with environment variable

const fs = require('fs');
const path = require('path');

console.log('🔨 Starting build process...');

// Read the source index.html
const indexPath = path.join(__dirname, 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

// Get the Stripe Publishable Key from environment
// Fallback to test key if not set (for local builds)
const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51SVKGLLLG2IkIMjNRGtLSTgFOKHA262pTUQZxtrDko025pTqT3eqQ5o3IVThdo1Em18mtHn8OB4vbZYPgW1sgsA200melmouPY';

console.log(`📝 Using Stripe key: ${stripeKey.substring(0, 20)}...`);

// Replace the placeholder with the actual key
const updatedContent = indexContent.replace(
    /pk_live_YOUR_STRIPE_PUBLISHABLE_KEY/g,
    stripeKey
);

// Write the updated content back to index.html
fs.writeFileSync(indexPath, updatedContent, 'utf8');

console.log('✅ Build complete! Stripe key injected into index.html');

// Verify the replacement worked
if (updatedContent.includes('pk_live_YOUR_STRIPE_PUBLISHABLE_KEY')) {
    console.warn('⚠️  Warning: Placeholder key still found in output!');
    process.exit(1);
} else {
    console.log('✓ Placeholder successfully replaced');
}
