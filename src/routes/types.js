const { TYPES } = require("../recordTypes");

async function routes(fastify) {
  fastify.get("/", async () => ({ items: TYPES, total: TYPES.length }));
}

module.exports = routes;
