// lib/paddle.ts — keep the server client, just import the shared constants
import { Paddle, Environment } from "@paddle/paddle-node-sdk";
import {
  PADDLE_PAYG_PRICE_ID,
  PAYG_PRICE_USD_CENTS,
  PAYG_MAX_PAGES,
} from "./paddleConfig";

if (!process.env.PADDLE_API_KEY) {
  throw new Error("PADDLE_API_KEY is not set. Add it to .env.local.");
}

/**
 * Server-side Paddle client. Environment is read from
 * NEXT_PUBLIC_PADDLE_ENV so sandbox vs. live always matches whatever the
 * client-side Paddle.js instance is using.
 */
export const paddle = new Paddle(process.env.PADDLE_API_KEY, {
  environment:
    process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
      ? Environment.production
      : Environment.sandbox,
});

export {
  PADDLE_PAYG_PRICE_ID,
  PAYG_PRICE_USD_CENTS,
  PAYG_MAX_PAGES,
};