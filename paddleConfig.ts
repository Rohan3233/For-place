// lib/paddleConfig.ts
// The PAYG price ID is env-driven like the Pro/Agency IDs. The placeholder
// default is deliberate: the source must never ship with a real Paddle price
// ID baked in. Set NEXT_PUBLIC_PADDLE_PRICE_ID_PAYG (in .env.local / your
// hosting platform) to the price you create in your Paddle dashboard —
// checkout and the webhook both key off this value.
export const PADDLE_PAYG_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PAYG ?? "Paddle_Price_ID_PayAsYouGo";
export const PAYG_PRICE_USD_CENTS = 500;
export const PAYG_MAX_PAGES = 50;