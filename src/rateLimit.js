const { sendError } = require("./errors");

const WINDOW_MS = 60 * 1000;
const buckets = new Map();

function rateLimit(req, reply, done) {
  const limit = parseInt(process.env.RATE_LIMIT_PER_MINUTE || "60", 10);
  const ip = req.ip || "unknown";
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(ip, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000));
    reply.header("Retry-After", String(retryAfterSec));
    return sendError(reply, 429, "rate_limited", `Rate limit of ${limit} requests/minute exceeded.`);
  }

  done();
}

module.exports = rateLimit;
