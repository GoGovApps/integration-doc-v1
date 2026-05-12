function sendError(reply, status, code, message, details) {
  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return reply.code(status).send(body);
}

module.exports = { sendError };
