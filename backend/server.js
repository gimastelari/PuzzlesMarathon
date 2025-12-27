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
    sponsor: "price_1SZ3TyFh9qMoW6v0ShTRC0o2",
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

app.get("/", (req, res) => {
  res.send("Puzzles Marathon Stripe backend is running");
});

app.listen(4242, () => {
  console.log("Stripe backend running on http://localhost:4242");
});
