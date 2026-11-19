// Record types the integration can be configured against. The selected type's `id`
// is sent back as `?type=<id>` on every record, child, and /fields call.
const TYPES = [{ id: "service-request", name: "Service Request" }];

module.exports = { TYPES };
