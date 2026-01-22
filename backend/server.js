
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const dotenv = require("dotenv");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =====================
// MIDDLEWARE
// =====================
app.use(cors());
app.use(express.json());

// =====================
// DATABASE (SQLite)
// =====================
let db;

(async () => {
  db = await open({
    filename: "./registrations.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Database ready");
})();

// =====================
// HEALTH CHECK
// =====================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// =====================
// SAVE REGISTRATION (PRE-PAYMENT)
// =====================
app.post("/save-registration", async (req, res) => {
  try {
    const { type, data } = req.body;

    const result = await db.run(
      "INSERT INTO registrations (type, data) VALUES (?, ?)",
      type,
      JSON.stringify(data)
    );

    res.json({ registrationId: result.lastID });
  } catch (err) {
    console.error("Save registration failed:", err);
    res.status(500).json({ error: "Failed to save registration" });
  }
});

// =====================
// CREATE CHECKOUT SESSION (PARTICIPANT / VENDOR / SPONSOR)
// =====================
app.post("/create-session", async (req, res) => {
  try {
    const { type, registrationId } = req.body;

    const priceMap = {
      participant: 2500,
      vendor: 5000,
      sponsor_silver: 30000,
      sponsor_gold: 15000,
    };

    const amount = priceMap[type];
    if (!amount) {
      return res.status(400).json({ error: "Invalid checkout type" });
    }

    const successPageMap = {
      participant: "payment-success-participant.html",
      vendor: "payment-success-vendor.html",
      sponsor_silver: "payment-success-sponsor.html",
      sponsor_gold: "payment-success-sponsor.html",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Puzzles Marathon – ${type}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `https://puzzlesmarathon.com/${successPageMap[type]}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: "https://puzzlesmarathon.com",
      metadata: {
        registrationId,
        type,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session failed:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

// =====================
// CREATE DONATION SESSION
// =====================
app.post("/create-donation-session", async (req, res) => {
  try {
    const { amount, registrationId } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Puzzles Marathon Donation",
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      success_url:
        "https://puzzlesmarathon.com/payment-success-donation.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://puzzlesmarathon.com",
      metadata: {
        registrationId,
        type: "donation",
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Donation session failed:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

// =====================
// FINALIZE REGISTRATION (POST-PAYMENT)
// =====================
app.post("/finalize-registration", async (req, res) => {
  try {
    const { sessionId, formspreeUrl } = req.body;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const registrationId = session.metadata.registrationId;

    const row = await db.get(
      "SELECT data FROM registrations WHERE id = ?",
      registrationId
    );

    if (!row) {
      return res.status(404).json({ error: "Registration not found" });
    }

    await fetch(formspreeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: row.data,
    });

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Finalize failed:", err);
    res.status(500).json({ error: "Finalize failed" });
  }
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

