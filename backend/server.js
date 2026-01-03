import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

app.post("/create-session", async (req, res) => {
  const { type } = req.body;

  const PRICE_IDS = {
    participant: "price_1SZ3TSFh9qMoW6v0dSK33Rjn",
    sponsor_silver: "price_1SZ3TyFh9qMoW6v0ShTRC0o2",
    sponsor_gold: "price_1SlLbtFh9qMoW6v0dDLLUa4Y",
    vendor: "price_1SkqHdFh9qMoW6v06M0gd1ro"
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price: PRICE_IDS[type], quantity: 1 }
      ],
      success_url: `https://puzzlesmarathon.com/payment-success-${type}.html`,
      cancel_url: "https://puzzlesmarathon.com",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/create-donation-session", async (req, res) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Puzzles Marathon Donation"
            },
            unit_amount: amount * 100
          },
          quantity: 1
        }
      ],
      success_url: "https://puzzlesmarathon.com/payment-success-donation.html",
      cancel_url: "https://puzzlesmarathon.com"
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});


app.get("/", (req, res) => {
  res.send("Puzzles Marathon Stripe backend is running");
});

app.listen(4242, () => {
  console.log("Stripe backend running on http://localhost:4242");
});
