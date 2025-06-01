const razorpayService = require('./razorpay')

async function completePayoutFlowExample () {
  try {
    console.log('🚀 Starting Complete Payout Flow Example')

    // Step 1: Check initial balance
    console.log('\n📊 Step 1: Checking Account Balance')
    const initialBalance = await razorpayService.getAccountBalance()
    console.log('Initial Balance:', `₹${initialBalance.balance / 100}`)

    // Step 2: Add funds if using mock (for testing)
    if (process.env.USE_MOCK_RAZORPAY === 'true') {
      console.log('\n💰 Step 2: Adding Mock Funds')
      await razorpayService.addFundsToAccount(1000000) // Add ₹10,000
    }

    // Step 3: Create Contact
    console.log('\n👤 Step 3: Creating Contact')
    const contact = await razorpayService.createContact({
      name: 'John Doe',
      email: 'john.doe@example.com',
      contact: '9876543210',
      type: 'vendor',
      reference_id: 'vendor_001',
      notes: {
        department: 'Engineering',
        employee_id: 'EMP001'
      }
    })
    console.log('Contact Created:', contact.id)

    // Step 4: Create Bank Fund Account
    console.log('\n🏦 Step 4: Creating Bank Fund Account')
    const bankFundAccount = await razorpayService.createFundAccount({
      contact_id: contact.id,
      account_type: 'bank_account',
      bank_account: {
        name: 'John Doe',
        ifsc: 'HDFC0000001',
        account_number: '1234567890123'
      }
    })
    console.log('Bank Fund Account Created:', bankFundAccount.id)

    // Step 5: Create UPI Fund Account
    console.log('\n📱 Step 5: Creating UPI Fund Account')
    const upiFundAccount = await razorpayService.createFundAccount({
      contact_id: contact.id,
      account_type: 'vpa',
      vpa: {
        address: 'johndoe@paytm'
      }
    })
    console.log('UPI Fund Account Created:', upiFundAccount.id)

    // Step 6: Create Bank Payout
    console.log('\n💸 Step 6: Creating Bank Payout (IMPS)')
    const bankPayout = await razorpayService.createPayout({
      fund_account_id: bankFundAccount.id,
      amount: 50000, // ₹500
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'vendor_bill',
      queue_if_low_balance: true,
      reference_id: `bank_payout_${Date.now()}`,
      narration: 'Payment for services rendered',
      notes: {
        invoice_number: 'INV-2025-001',
        project: 'Website Development'
      }
    })
    console.log('Bank Payout Created:', bankPayout.id, '- Status:', bankPayout.status)

    // Step 7: Create UPI Payout
    console.log('\n📱 Step 7: Creating UPI Payout')
    const upiPayout = await razorpayService.createPayout({
      fund_account_id: upiFundAccount.id,
      amount: 25000, // ₹250
      currency: 'INR',
      mode: 'UPI',
      purpose: 'cashback',
      queue_if_low_balance: true,
      reference_id: `upi_payout_${Date.now()}`,
      narration: 'Cashback payment'
    })
    console.log('UPI Payout Created:', upiPayout.id, '- Status:', upiPayout.status)

    // Step 8: Check final balance
    console.log('\n📊 Step 8: Checking Final Balance')
    const finalBalance = await razorpayService.getAccountBalance()
    console.log('Final Balance:', `₹${finalBalance.balance / 100}`)

    // Step 9: Get payout details
    console.log('\n🔍 Step 9: Retrieving Payout Details')
    const retrievedPayout = await razorpayService.getPayoutById(bankPayout.id)
    console.log('Retrieved Payout Status:', retrievedPayout.status)

    console.log('\n✅ Complete Payout Flow Example Completed Successfully!')

    return {
      contact,
      bankFundAccount,
      upiFundAccount,
      bankPayout,
      upiPayout,
      finalBalance
    }
  } catch (error) {
    console.error('❌ Error in complete payout flow:', error.message)
    throw error
  }
}

// Example usage with different scenarios
async function differentPayoutModesExample () {
  try {
    console.log('🧪 Testing Different Payout Modes')

    // Assume we have existing contact and fund account
    const contact = await razorpayService.createContact({
      name: 'Test Vendor',
      type: 'vendor'
    })

    const fundAccount = await razorpayService.createFundAccount({
      contact_id: contact.id,
      account_type: 'bank_account',
      bank_account: {
        name: 'Test Vendor',
        ifsc: 'ICIC0000001',
        account_number: '9876543210987'
      }
    })

    // Test IMPS (Fast, 24x7)
    const impsPayout = await razorpayService.createPayout({
      fund_account_id: fundAccount.id,
      amount: 10000,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'vendor_bill'
    })

    // Test NEFT (Business hours)
    const neftPayout = await razorpayService.createPayout({
      fund_account_id: fundAccount.id,
      amount: 50000,
      currency: 'INR',
      mode: 'NEFT',
      purpose: 'vendor_bill'
    })

    // Test RTGS (High value, business hours)
    const rtgsPayout = await razorpayService.createPayout({
      fund_account_id: fundAccount.id,
      amount: 250000,
      currency: 'INR',
      mode: 'RTGS',
      purpose: 'vendor_bill'
    })

    console.log('✅ All payout modes tested successfully!')
    return { impsPayout, neftPayout, rtgsPayout }
  } catch (error) {
    console.error('❌ Error testing payout modes:', error.message)
    throw error
  }
}

module.exports = {
  completePayoutFlowExample,
  differentPayoutModesExample
}
