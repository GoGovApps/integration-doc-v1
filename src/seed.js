const store = require("./store");

function isoAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function seed() {
  store._seed({
    record: {
      id: "REQ-001",
      displayId: "REQ-001",
      updatedAt: isoAgo(2 * HOUR),
      url: "https://vendor.example.com/records/REQ-001",
      fields: {
        title: "Pothole on Main Street",
        status: "open",
        priority: "high",
        description: "Large pothole near the intersection of Main and 5th.",
        createdAt: isoAgo(3 * DAY),
      },
    },
    comments: [
      {
        id: "CMT-1",
        message: "Crew has been dispatched. ETA tomorrow morning.",
        sender: { name: "Alex Rivera", email: "alex@vendor.example.com" },
        dateSent: isoAgo(90 * 60 * 1000),
        visibility: "public",
      },
      {
        id: "CMT-2",
        message: "Resident contacted to confirm they will not block the area.",
        sender: { name: "Alex Rivera", email: "alex@vendor.example.com" },
        dateSent: isoAgo(60 * 60 * 1000),
        visibility: "public",
      },
      {
        id: "CMT-3",
        message: "Note for staff: budget code STREET-2026-Q2.",
        sender: { name: "Casey Park", email: "casey@vendor.example.com" },
        dateSent: isoAgo(30 * 60 * 1000),
        visibility: "internal",
      },
    ],
    attachments: [
      {
        id: "ATT-1",
        name: "pothole-photo.jpg",
        description: "Photo of the pothole submitted by the resident.",
        fileType: "image/jpeg",
        size: 482931,
        dateUploaded: isoAgo(2 * HOUR),
        downloadUrl: "https://placehold.co/600x400.jpg",
      },
    ],
  });

  store._seed({
    record: {
      id: "REQ-002",
      displayId: "REQ-002",
      updatedAt: isoAgo(1 * DAY),
      url: "https://vendor.example.com/records/REQ-002",
      fields: {
        title: "Streetlight outage on Oak Avenue",
        status: "in_progress",
        priority: "medium",
        description: "Three consecutive lights dark on the 400 block.",
        createdAt: isoAgo(4 * DAY),
      },
    },
    comments: [
      {
        id: "CMT-4",
        message: "Utility crew scheduled for Wednesday.",
        sender: { name: "Jordan Lee", email: "jordan@vendor.example.com" },
        dateSent: isoAgo(1 * DAY),
        visibility: "public",
      },
    ],
    attachments: [],
  });

  store._seed({
    record: {
      id: "REQ-003",
      displayId: "REQ-003",
      updatedAt: isoAgo(7 * DAY),
      url: "https://vendor.example.com/records/REQ-003",
      fields: {
        title: "Sidewalk repair request",
        status: "closed",
        priority: "low",
        description: "Cracked sidewalk panel at 200 Elm Street.",
        createdAt: isoAgo(30 * DAY),
        resolvedAt: isoAgo(7 * DAY),
      },
    },
    comments: [],
    attachments: [],
  });
}

module.exports = seed;
