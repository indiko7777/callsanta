import os

file_path = r'c:\Users\indik\twilio-power-dialer\callsanta\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the last </script> tag
index = content.rfind('</script>')

if index == -1:
    print("Error: </script> tag not found")
    exit(1)

# Code to insert
js_code = """
            // === RESTORED FUNCTIONS ===

            function closePaymentModal() {
                const modalOverlay = document.getElementById('payment-modal-overlay');
                const modal = document.getElementById('payment-modal');
                modalOverlay.classList.remove('active');
                modal.classList.remove('active');
            }

            function handleModalPayment() {
                const selectedPackage = document.querySelector('input[name="package_id"]:checked');
                if (!selectedPackage) return;

                // Hide selection, show payment
                document.getElementById('modal-selection-view').classList.add('hidden');
                document.getElementById('modal-payment-view').classList.remove('hidden');
                
                createPaymentIntent();
            }

            async function createPaymentIntent() {
                 const selectedPackage = document.querySelector('input[name="package_id"]:checked').value;
                 const parentEmail = document.getElementById('form-parent-email').value;
                 const parentPhone = document.getElementById('form-parent-phone').value;
                 
                 // Get overage option safely
                 const overageInput = document.querySelector('input[name="overage_option"]:checked');
                 const overageOption = overageInput ? overageInput.value : 'auto_disconnect';
                 
                 const children = [];
                 for (let i = 1; i <= currentChildCount; i++) {
                     children.push({
                         name: document.getElementById(`form-child-name-${i}`).value,
                         wish: document.getElementById(`form-child-wish-${i}`).value,
                         deed: document.getElementById(`form-child-deed-${i}`).value
                     });
                 }

                 // Show loading state
                 const paymentElementContainer = document.getElementById('modal-payment-element');
                 paymentElementContainer.innerHTML = '<div class="text-center text-gray-500 py-6">Loading secure payment form...</div>';

                 try {
                     const response = await fetch('/.netlify/functions/create-payment-intent', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({
                             package_id: selectedPackage,
                             parent_email: parentEmail,
                             parent_phone: parentPhone,
                             children: children,
                             overage_option: overageOption
                         })
                     });
                     
                     const data = await response.json();
                     if (data.clientSecret) {
                         initializeStripe(data.clientSecret);
                     } else {
                         console.error('No client secret');
                         paymentElementContainer.innerHTML = '<div class="text-center text-red-500 py-6">Error loading payment. Please try again.</div>';
                     }
                 } catch (e) {
                     console.error(e);
                     paymentElementContainer.innerHTML = '<div class="text-center text-red-500 py-6">Error loading payment. Please try again.</div>';
                 }
            }

            function initializeStripe(clientSecret) {
                const appearance = { 
                    theme: 'night', 
                    variables: { 
                        colorPrimary: '#D42426',
                        colorText: '#F3F4F6',
                        colorBackground: '#101827',
                        colorDanger: '#EF4444',
                        fontFamily: 'Inter, sans-serif'
                    } 
                };
                elements = stripe.elements({ appearance, clientSecret });
                const paymentElement = elements.create('payment');
                paymentElement.mount('#modal-payment-element');
            }

            function updateModalUIState() {
                const selectedPackage = document.querySelector('input[name="package_id"]:checked');
                const selectedOverage = document.querySelector('input[name="overage_option"]:checked');
                
                if (!selectedPackage) return;
                
                let price = parseInt(selectedPackage.dataset.price);
                
                // Extra children
                const extraChildren = Math.max(0, currentChildCount - 1);
                price += extraChildren * 750;
                
                // Overage
                if (selectedOverage && selectedOverage.value === 'unlimited' && selectedPackage.value !== 'bundle') {
                    price += 500;
                }
                
                const formattedPrice = '$' + (price / 100);
                
                // Update displays
                const finalPriceEl = document.getElementById('modal-final-price');
                if (finalPriceEl) finalPriceEl.textContent = formattedPrice;
                
                const finalPriceStripeEl = document.getElementById('modal-final-price-stripe');
                if (finalPriceStripeEl) finalPriceStripeEl.textContent = formattedPrice;
                
                const modalBtnText = document.getElementById('modal-button-text');
                if (modalBtnText) modalBtnText.textContent = `Secure Your Magic (${formattedPrice})`;
                
                const finalPayBtnText = document.getElementById('final-pay-button-text');
                if (finalPayBtnText) finalPayBtnText.textContent = `Pay Now (${formattedPrice})`;
                
                // Show/hide extra charge label
                const extraLabel = document.getElementById('modal-extra-charge-label');
                if (extraLabel) {
                    if (extraChildren > 0) {
                        extraLabel.textContent = `Includes +$${(extraChildren * 7.50).toFixed(2)} for ${extraChildren} extra child${extraChildren > 1 ? 'ren' : ''}`;
                        extraLabel.classList.remove('hidden');
                    } else {
                        extraLabel.classList.add('hidden');
                    }
                }
            }
            
            // Add event listeners
            document.querySelectorAll('input[name="package_id"], input[name="overage_option"]').forEach(input => {
                input.addEventListener('change', updateModalUIState);
            });
            
            // Initial update
            updateModalUIState();

            // === PROMO CODE ===
            async function validatePromoCode() {
                const promoInput = document.getElementById('promo-code-input');
                const promoBtn = document.getElementById('promo-apply-btn');
                const promoMessage = document.getElementById('promo-message');
                
                const promoCode = promoInput.value.trim().toUpperCase();
                if (!promoCode) {
                    promoMessage.classList.remove('hidden', 'text-green-400');
                    promoMessage.classList.add('text-red-400');
                    promoMessage.textContent = 'Please enter a code.';
                    return;
                }

                promoBtn.disabled = true;
                promoBtn.textContent = 'Checking...';

                const children = [];
                for (let i = 1; i <= currentChildCount; i++) {
                    children.push({
                        name: document.getElementById(`form-child-name-${i}`).value,
                        wish: document.getElementById(`form-child-wish-${i}`).value,
                        deed: document.getElementById(`form-child-deed-${i}`).value
                    });
                }

                try {
                    const response = await fetch('/.netlify/functions/validate-promo-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            promoCode: promoCode,
                            package_id: document.querySelector('input[name="package_id"]:checked').value,
                            parent_email: document.getElementById('form-parent-email').value,
                            parent_phone: document.getElementById('form-parent-phone').value,
                            children: children,
                            overage_option: 'unlimited'
                        })
                    });

                    const data = await response.json();

                    if (data.valid) {
                        promoMessage.classList.remove('hidden', 'text-red-400');
                        promoMessage.classList.add('text-green-400');
                        promoMessage.textContent = data.message || 'Code applied!';
                        setTimeout(() => {
                            window.location.href = `success.html?payment_intent=promo_${data.orderId}&access_code=${data.accessCode}`;
                        }, 1000);
                    } else {
                        promoMessage.classList.remove('hidden', 'text-green-400');
                        promoMessage.classList.add('text-red-400');
                        promoMessage.textContent = data.message || 'Invalid code.';
                        promoBtn.disabled = false;
                        promoBtn.textContent = 'Apply';
                    }
                } catch (error) {
                    promoMessage.classList.remove('hidden', 'text-green-400');
                    promoMessage.classList.add('text-red-400');
                    promoMessage.textContent = 'Error. Try again or pay normally.';
                    promoBtn.disabled = false;
                    promoBtn.textContent = 'Apply';
                }
            }
"""

new_content = content[:index] + js_code + content[index:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully restored JS functions")
