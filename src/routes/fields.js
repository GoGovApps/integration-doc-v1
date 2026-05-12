const FIELD_DEFINITIONS = [
  {
    name: "title",
    type: "string",
    syncDirection: "TwoWay",
    required: true,
    description: "Short human-readable summary of the record.",
  },
  {
    name: "status",
    type: "enum",
    syncDirection: "TwoWay",
    required: true,
    allowedValues: ["open", "in_progress", "closed"],
    description: "Lifecycle state of the record.",
  },
  {
    name: "priority",
    type: "enum",
    syncDirection: "Push",
    required: false,
    allowedValues: ["low", "medium", "high"],
    description: "Triage priority set by the originating system.",
  },
  {
    name: "description",
    type: "string",
    syncDirection: "TwoWay",
    required: false,
    description: "Longer narrative describing the issue.",
  },
  {
    name: "resolvedAt",
    type: "date",
    syncDirection: "Pull",
    required: false,
    description: "Timestamp at which the record was resolved, if applicable.",
  },
  {
    name: "createdAt",
    type: "date",
    syncDirection: "PushOnce",
    required: false,
    description: "Original creation timestamp from the source system. Sent on create only.",
  },
];

async function routes(fastify) {
  fastify.get("/", async () => ({ items: FIELD_DEFINITIONS, total: FIELD_DEFINITIONS.length }));
}

module.exports = routes;
