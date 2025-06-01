// Example usage file: examples/payoutExample.js
const PayoutHelper = require('../razorpay/razorpayHelper')

async function examplePayoutUsage () {
  try {
    const contactData = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      contact: '9876543210',
      type: 'vendor',
      reference_id: 'vendor_001'
    }

    const bankDetails = {
      name: 'John Doe',
      ifsc: 'HDFC0000001',
      account_number: '1234567890123'
    }

    const payoutDetails = {
      amount: 100000, // ₹1000 in paise
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'vendor_bill',
      reference_id: 'payout_001',
      narration: 'Payment for services'
    }

    const result = await PayoutHelper.processCompletePayoutFlow(
      contactData,
      bankDetails,
      payoutDetails
    )

    console.log('Complete payout flow result:', result)
    return result
  } catch (error) {
    console.error('Error in example payout usage:', error)
    throw error
  }
}

module.exports = {
  examplePayoutUsage
}
