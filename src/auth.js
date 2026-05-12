const { sendError } = require("./errors");

const OPEN_PATHS = new Set(["/", "/health"]);

function auth(req, reply, done) {
  if (OPEN_PATHS.has(req.url.split("?")[0])) return done();

  const mode = (process.env.AUTH_MODE || "apikey").toLowerCase();

  if (mode === "apikey") {
    const expected = process.env.API_KEY;
    const provided = req.headers["x-api-key"];
    if (!expected) {
      return sendError(reply, 500, "server_misconfigured", "API_KEY env var is not set on the server.");
    }
    if (provided !== expected) {
      return sendError(reply, 401, "unauthorized", "Missing or invalid X-API-Key header.");
    }
    return done();
  }

  if (mode === "basic") {
    const user = process.env.BASIC_USER;
    const pass = process.env.BASIC_PASS;
    if (!user || !pass) {
      return sendError(reply, 500, "server_misconfigured", "BASIC_USER and BASIC_PASS must both be set.");
    }
    const header = req.headers["authorization"] || "";
    if (!header.startsWith("Basic ")) {
      reply.header("WWW-Authenticate", 'Basic realm="integration-doc"');
      return sendError(reply, 401, "unauthorized", "Missing Authorization: Basic header.");
    }
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) {
      return sendError(reply, 401, "unauthorized", "Malformed Basic credentials.");
    }
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u !== user || p !== pass) {
      return sendError(reply, 401, "unauthorized", "Invalid username or password.");
    }
    return done();
  }

  return sendError(reply, 500, "server_misconfigured", `Unknown AUTH_MODE '${mode}'. Use 'apikey' or 'basic'.`);
}

module.exports = auth;
