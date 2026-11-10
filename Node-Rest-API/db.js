const mongoose = require("mongoose");

let lastError = null;

async function connect(url) {
  if (!url) {
    lastError = "MONGO_URL is not set";
    console.error("MongoDB connection error:", lastError);
    return;
  }
  try {
    await mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true });
    lastError = null;
    console.log("Connected to MongoDB");
  } catch (err) {
    lastError = err.message;
    console.error("MongoDB connection error:", err.message);
  }
}

// Connection state for /api/health (no secrets).
function status() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return { db: states[mongoose.connection.readyState], error: lastError };
}

module.exports = { connect, status };
