require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Shopify = require('shopify-api-node');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  apiVersion: '2023-04',
});

const ESEWA_VERIFY_URL = 'https://esewa.com.np/epay/transrec';

// Start eSewa payment - returns payment URL to client
app.post('/start-esewa-payment', (req, res) => {
  const { amount, productId } = req.body;

  if (!amount || !productId) {
    return res.status(400).json({ error: 'amount and productId are required' });
  }

  const transactionId = `trx_${Date.now()}`;

  const paymentUrl = `https://esewa.com.np/epay/main?amt=${amount}&pid=${productId}&scd=${process.env.ESEWA_MERCHANT_CODE}&su=${encodeURIComponent(process.env.ESEWA_SUCCESS_URL + '?transactionId=' + transactionId)}&fu=${encodeURIComponent(process.env.ESEWA_FAILURE_URL)}`;

  // TODO: Save transactionId and order info to DB here if needed

  res.json({ paymentUrl });
});

// eSewa success callback - verify payment & create Shopify order
app.get('/esewa-success', async (req, res) => {
  const { amt, pid, rid, transactionId } = req.query;

  if (!amt || !pid || !rid) {
    return res.status(400).send('<h2>Missing payment verification parameters</h2>');
  }

  try {
    const verifyResponse = await axios.post(
      ESEWA_VERIFY_URL,
      null,
      {
        params: {
          amt: amt,
          pid: pid,
          rid: rid,
          scd: process.env.ESEWA_MERCHANT_CODE,
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (verifyResponse.data.includes('Success')) {
      // TODO: Fetch customer/order info from your DB using transactionId

      // Dummy customer & order data for demo:
      const customerInfo = {
        email: 'customer@example.com',
        shippingAddress: {
          first_name: 'John',
          last_name: 'Doe',
          address1: 'Main Street',
          city: 'Kathmandu',
          province: 'Bagmati',
          country: 'Nepal',
          zip: '44600',
        },
        billingAddress: {
          first_name: 'John',
          last_name: 'Doe',
          address1: 'Main Street',
          city: 'Kathmandu',
          province: 'Bagmati',
          country: 'Nepal',
          zip: '44600',
        },
      };

      const lineItems = [
        {
          variant_id: 123456789, // Replace with your actual product variant ID
          quantity: 1,
        },
      ];

      const order = await shopify.order.create({
        email: customerInfo.email,
        fulfillment_status: 'unfulfilled',
        financial_status: 'paid',
        line_items: lineItems,
        shipping_address: customerInfo.shippingAddress,
        billing_address: customerInfo.billingAddress,
      });

      res.send(`<h2>Payment successful!</h2><p>Order ID: ${order.id}</p>`);
    } else {
      res.send('<h2>Payment verification failed</h2>');
    }
  } catch (error) {
    console.error('Error verifying eSewa payment:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/esewa-failure', (req, res) => {
  res.send('<h2>Payment failed or cancelled</h2>');
});

// Export the express app as a Vercel serverless function handler
module.exports = app;
