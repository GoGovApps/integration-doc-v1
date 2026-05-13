async function routes(fastify) {
  const payload = {
    success: true,
    message: "Partner API is reachable. Authentication is not checked on this endpoint.",
  };

  fastify.get("/", async () => payload);
  fastify.get("/health", async () => payload);
}

module.exports = routes;
