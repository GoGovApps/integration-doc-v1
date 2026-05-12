const store = require("../store");
const { sendError } = require("../errors");

async function routes(fastify) {
  fastify.get("/:id/attachments", async (req, reply) => {
    const list = store.listAttachments(req.params.id);
    if (list === null) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.send({ items: list, total: list.length });
  });

  fastify.post("/:id/attachments", async (req, reply) => {
    if (!req.body || typeof req.body !== "object") {
      return sendError(reply, 400, "bad_request", "Request body must be a JSON object.");
    }
    const { name, description, fileType, size, downloadUrl } = req.body;
    if (!name || typeof name !== "string") {
      return sendError(reply, 400, "bad_request", "'name' is required.");
    }
    if (!fileType || typeof fileType !== "string") {
      return sendError(reply, 400, "bad_request", "'fileType' is required (e.g. 'image/jpeg').");
    }
    if (typeof size !== "number" || size < 0) {
      return sendError(reply, 400, "bad_request", "'size' must be a non-negative number (bytes).");
    }
    if (!downloadUrl || typeof downloadUrl !== "string") {
      return sendError(reply, 400, "bad_request", "'downloadUrl' is required.");
    }
    const attachment = store.addAttachment(req.params.id, {
      name,
      description,
      fileType,
      size,
      downloadUrl,
    });
    if (!attachment) {
      return sendError(reply, 404, "not_found", `No record with id '${req.params.id}'.`);
    }
    return reply.code(201).send(attachment);
  });

  fastify.get("/:id/attachments/:attachmentId/download", async (req, reply) => {
    const attachment = store.getAttachment(req.params.id, req.params.attachmentId);
    if (!attachment) {
      return sendError(reply, 404, "not_found", "Attachment not found on this record.");
    }
    return reply.send({ downloadUrl: attachment.downloadUrl });
  });
}

module.exports = routes;
