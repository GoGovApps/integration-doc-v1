const store = require("../store");
const { sendError } = require("../errors");

const MAX_LIMIT = 100;

function parsePositiveInt(value, fallback, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  if (max !== undefined) return Math.min(n, max);
  return n;
}

async function routes(fastify) {
  fastify.get("/", async (req, reply) => {
    const { ids, updatedSince, limit, offset } = req.query;
    const parsedIds = ids ? String(ids).split(",").map((s) => s.trim()).filter(Boolean) : undefined;

    if (updatedSince && Number.isNaN(new Date(updatedSince).getTime())) {
      return sendError(reply, 400, "bad_request", "updatedSince must be an ISO 8601 timestamp.");
    }

    const result = store.listRecords({
      ids: parsedIds,
      updatedSince,
      limit: parsePositiveInt(limit, 10, MAX_LIMIT),
      offset: parsePositiveInt(offset, 0),
    });

    return reply.send(result);
  });

  fastify.get("/:id", async (req, reply) => {
    const record = store.getRecord(req.params.id);
    if (!record) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.send(record);
  });

  fastify.post("/", async (req, reply) => {
    if (!req.body || typeof req.body !== "object") {
      return sendError(reply, 400, "bad_request", "Request body must be a JSON object.");
    }
    const { fields, externalReference } = req.body;
    if (!fields || typeof fields !== "object") {
      return sendError(reply, 400, "bad_request", "Body must include a 'fields' object.");
    }
    if (!fields.title || typeof fields.title !== "string") {
      return sendError(reply, 400, "bad_request", "fields.title is required.");
    }
    const record = store.createRecord({ fields, externalReference });
    return reply.code(201).send(record);
  });

  fastify.put("/:id", async (req, reply) => {
    if (!req.body || typeof req.body !== "object") {
      return sendError(reply, 400, "bad_request", "Request body must be a JSON object.");
    }
    const updated = store.updateRecord(req.params.id, {
      fields: req.body.fields,
      externalReference: req.body.externalReference,
    });
    if (!updated) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.send(updated);
  });
}

module.exports = routes;
