import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import helmet from "helmet";


const app = express();
const PORT = process.env.PORT || 9876;
const WINDOW_SIZE = 10;

// Enable CORS and security headers
app.use(cors());
app.use(helmet());

// Map of API endpoints for different number types
const API_ENDPOINTS = {
  p: "http://20.244.56.144/evaluation-service/primes",
  f: "http://20.244.56.144/evaluation-service/fibo",
  e: "http://20.244.56.144/evaluation-service/even",
  r: "http://20.244.56.144/evaluation-service/rand",
};

let numberWindow = [];

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root
app.get("/", (req, res) => {
  res.status(200).json({
    name: "Average Calculator Microservice",
    endpoints: {
      "/numbers/:numberid":
        "Get numbers and calculate average. Valid numberid values: p, f, e, r",
      "/health": "Health check endpoint",
    },
  });
});

// Main logic
app.get("/numbers/:numberid", async (req, res) => {
  const startTime = Date.now();
  const { numberid } = req.params;

  if (!["p", "f", "e", "r"].includes(numberid)) {
    return res.status(400).json({
      error: "Invalid number ID. Use p, f, e, or r.",
    });
  }

  try {
    const windowPrevState = [...numberWindow];
    const numbers = await fetchNumbersWithTimeout(API_ENDPOINTS[numberid], 500);

    updateWindow(numbers);
    const avg = calculateAverage(numberWindow);

    const processingTime = Date.now() - startTime;
    if (processingTime > 450) {
      console.warn(`⚠️ Processing time close to limit: ${processingTime}ms`);
    }

    return res.json({
      windowPrevState,
      windowCurrState: numberWindow,
      numbers,
      avg: Number.parseFloat(avg.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({
      error: "Failed to process request",
      message: error.message,
    });
  }
});

// Fetch helper with timeout
async function fetchNumbersWithTimeout(url, timeoutMs) {
  const AbortController = globalThis.AbortController || require("abort-controller");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const data = await response.json();
    return data.numbers || [];
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.warn(`⏱️ Request to ${url} timed out`);
      return [];
    }
    throw err;
  }
}

// Update sliding window
function updateWindow(newNumbers) {
  const unique = newNumbers.filter((num) => !numberWindow.includes(num));
  if (unique.length === 0) return;

  const overflow = numberWindow.length + unique.length - WINDOW_SIZE;
  if (overflow > 0) {
    numberWindow = numberWindow.slice(overflow);
  }

  numberWindow = [...numberWindow, ...unique.slice(0, WINDOW_SIZE - numberWindow.length)];
}

// Calculate average
function calculateAverage(numbers) {
  if (!numbers.length) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}

// Fallback
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "production" ? "Unexpected error" : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Running at http://localhost:${PORT}`);
  console.log(`🔢 Window size: ${WINDOW_SIZE}`);
});

// Shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down.");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down.");
  process.exit(0);
});
