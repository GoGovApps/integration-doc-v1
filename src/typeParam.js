const { sendError } = require("./errors");
const { TYPES } = require("./recordTypes");

const UNSCOPED_PATHS = new Set(["/", "/health", "/types"]);

// Reject calls whose `?type=` names a type we don't expose. Omitting the parameter
// is allowed (the adapter only sends it when a type is configured).
function typeParam(req, reply, done) {
  const path = req.url.split("?")[0].replace(/\/+$/, "") || "/";
  if (UNSCOPED_PATHS.has(path)) return done();

  const { type } = req.query || {};
  if (type === undefined) return done();
  if (!TYPES.some((t) => t.id === type)) {
    return sendError(reply, 400, "bad_request", `Unknown record type '${type}'.`, {
      allowed: TYPES.map((t) => t.id),
    });
  }
  return done();
}

module.exports = typeParam;
