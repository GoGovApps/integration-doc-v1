const store = require("../store");
const { sendError } = require("../errors");

async function routes(fastify) {
  fastify.get("/:id/comments", async (req, reply) => {
    const list = store.listComments(req.params.id);
    if (list === null) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.send({ items: list, total: list.length });
  });

  fastify.post("/:id/comments", async (req, reply) => {
    if (!req.body || typeof req.body !== "object") {
      return sendError(reply, 400, "bad_request", "Request body must be a JSON object.");
    }
    const { message, sender, visibility } = req.body;
    if (!message || typeof message !== "string") {
      return sendError(reply, 400, "bad_request", "'message' is required and must be a string.");
    }
    if (!sender || typeof sender !== "object" || !sender.name) {
      return sendError(reply, 400, "bad_request", "'sender.name' is required.");
    }
    if (visibility !== undefined && visibility !== "public" && visibility !== "internal") {
      return sendError(reply, 400, "bad_request", "'visibility' must be 'public' or 'internal' when present.");
    }
    const comment = store.addComment(req.params.id, { message, sender, visibility });
    if (!comment) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.code(201).send(comment);
  });
}

module.exports = routes;
