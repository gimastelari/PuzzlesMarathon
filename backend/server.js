import express from "express";
import cors from "cors";
import Stripe from “stripe”;
import dotenv from "dotenv";
import crypto from "crypto";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

/* ============================
   DATABASE (SQLite)
============================ */

const db = await open({
  filename: "./registrations.db",
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    type TEXT,
    data TEXT,
    status TEXT,
    stripe_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/* ============================
   PRICE IDS
============================ */

const PRICE_IDS = {
  participant: process.env.STRIPE_RUNNER_PRICE_ID,
  sponsor_gold: process.env.STRIPE_SPONSOR_GOLD_PRICE_ID,
  sponsor_silver: process.env.STRIPE_SPONSOR_SILVER_PRICE_ID,
  vendor: process.env.STRIPE_VENDOR_PRICE_ID
};

/* ============================
   SAVE REGISTRATION (PRE-PAYMENT)
============================ */

app.post("/save-registration", async (req, res) => {
  try {
    const registrationId = crypto.randomUUID();
    const { type, data } = req.body;

    await db.run(
      `INSERT INTO registrations (id, type, data, status)
       VALUES (?, ?, ?, ?)`,
      registrationId,
      type,
      JSON.stringify(data),
      "PENDING"
    );

    res.json({ registrationId });
  } catch (err) {
    console.error("SAVE REGISTRATION ERROR:", err);
    res.status(500).json({ error: "Failed to save registration" });
  }
});

/* ============================
   CREATE STRIPE SESSION
============================ */

app.post("/create-session", async (req, res) => {
  try {
    const { type, registrationId } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: PRICE_IDS[type],
          quantity: 1
        }
      ],
      metadata: {
        registrationId
      },
      success_url: `https://puzzlesmarathon.com/payment-success-${type}.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: "https://puzzlesmarathon.com"
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("CREATE SESSION ERROR:", err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});

/* ============================
   DONATION SESSION
============================ */

app.post("/create-donation-session", async (req, res) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Donation" },
            unit_amount: amount * 100
          },
          quantity: 1
        }
      ],
      success_url: `https://puzzlesmarathon.com/payment-success-donation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: "https://puzzlesmarathon.com"
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("DONATION SESSION ERROR:", err);
    res.status(500).json({ error: "Donation session failed" });
  }
});

/* ============================
   FINALIZE REGISTRATION (POST-PAYMENT)
============================ */

app.post("/finalize-registration", async (req, res) => {
  const { sessionId, formspreeUrl } = req.body;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const registrationId = session.metadata.registrationId;

    const record = await db.get(
      `SELECT * FROM registrations WHERE id = ?`,
      registrationId
    );

    if (!record) {
      throw new Error("Registration not found");
    }

    await fetch(formspreeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: record.data
    });

    await db.run(
      `UPDATE registrations
       SET status = ?, stripe_session_id = ?
       WHERE id = ?`,
      "PAID",
      sessionId,
      registrationId
    );

    res.json({ success: true });
  } catch (err) {
    console.error("FINALIZATION ERROR:", err);

    // 🔔 Optional: Email yourself via Formspree on failure
    await fetch("https://formspree.io/f/YOUR_ADMIN_FORM_ID", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message,
        sessionId,
        timestamp: new Date().toISOString()
      })
    });

    res.status(500).json({ error: "Finalization failed" });
  }
});

/* ============================
   SERVER START
============================ */

const PORT = process.env.PORT || 4242;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
