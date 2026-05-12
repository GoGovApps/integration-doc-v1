const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const fastify = require("fastify")({ logger: true });

const rateLimit = require("./src/rateLimit.js");
const auth = require("./src/auth.js");
const seed = require("./src/seed.js");

seed();

fastify.addHook("preHandler", rateLimit);
fastify.addHook("preHandler", auth);

fastify.register(require("./src/routes/health.js"));
fastify.register(require("./src/routes/records.js"), { prefix: "/records" });
fastify.register(require("./src/routes/comments.js"), { prefix: "/records" });
fastify.register(require("./src/routes/attachments.js"), { prefix: "/records" });
fastify.register(require("./src/routes/fields.js"), { prefix: "/fields" });

const port = parseInt(process.env.PORT || "3000", 10);

fastify.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
