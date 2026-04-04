require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const results = [];

fs.createReadStream('payments.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', async () => {
    console.log(`Loaded ${results.length} payments`);

    let sent = 0;
    let skipped = 0;

    for (const row of results) {
      const chargeId = row['id']; // ch_...
      const email = row['Customer Email'];

      if (!chargeId || !email) {
        console.log(` Skipping row (missing data)`);
        skipped++;
        continue;
      }

      try {
        // Step 1: Get charge
        const charge = await stripe.charges.retrieve(chargeId);

        if (!charge.payment_intent) {
          console.log(` No payment intent for ${chargeId}`);
          skipped++;
          continue;
        }

        // Step 2: Send receipt via PaymentIntent
        await stripe.paymentIntents.update(charge.payment_intent, {
          receipt_email: email,
        });

        console.log(`Receipt sent to ${email}`);
        sent++;
      } catch (err) {
        console.error(`Error for ${chargeId}:`, err.message);
      }
    }

    console.log("\n DONE");
    console.log(` Sent: ${sent}`);
    console.log(` Skipped: ${skipped}`);
  });