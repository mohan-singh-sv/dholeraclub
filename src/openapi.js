const resources = [
  ['banners', 'Home carousel images and captions'],
  ['members', 'Membership applications and approved members'],
  ['clubs', 'City chapters'],
  ['notices', 'Notice board'],
  ['facilities', 'Association facilities, including bookable rooms'],
  ['events', 'Events shown on the mobile Events tab'],
  ['event_bookings', 'Member event bookings'],
  ['gallery', 'Gallery albums'],
  ['packages', 'Packages and passes'],
  ['enquiries', 'Package requests from the app'],
  ['directory', 'Office directory contacts'],
  ['transactions', 'Member dues and receipts'],
  ['tickets', 'Event passes'],
  ['room_bookings', 'Meeting room requests'],
  ['notifications', 'Push-style notices inside the app. Leave member_id empty to send to everyone'],
  ['masters', 'Master lists: membership_category and business_nature'],
];

const bearer = [{ bearerAuth: [] }];
const json = {
  required: true,
  content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
};
const ok = { 200: { description: 'OK' }, 400: { description: 'Invalid request' }, 401: { description: 'Unauthorized' } };

function crud(name, summary) {
  return {
    [`/api/admin/${name}`]: {
      get: { tags: ['Admin'], summary: `List ${name}`, description: summary, security: bearer, responses: ok },
      post: { tags: ['Admin'], summary: `Create ${name}`, description: summary, security: bearer, requestBody: json, responses: ok },
    },
    [`/api/admin/${name}/{id}`]: {
      put: {
        tags: ['Admin'],
        summary: `Update ${name}`,
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: json,
        responses: ok,
      },
      delete: {
        tags: ['Admin'],
        summary: `Delete ${name}`,
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: ok,
      },
    },
  };
}

const paths = {
  '/api/health': {
    get: { tags: ['Public'], summary: 'Health check, including MongoDB', responses: ok },
  },
  '/api/config': {
    get: {
      tags: ['Public'],
      summary: 'App name, colours, categories, and clubs for the register screen',
      responses: ok,
    },
  },
  '/api/auth/login': {
    post: {
      tags: ['Mobile auth'],
      summary: 'Sign in with mobile + password or email + password',
      description: 'Unknown members return code NOT_REGISTERED. Pending applications return code PENDING.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['identifier', 'password'],
              properties: {
                identifier: { type: 'string', example: '9876543210' },
                password: { type: 'string', example: 'Member@123' },
              },
            },
          },
        },
      },
      responses: ok,
    },
  },
  '/api/auth/otp/request': {
    post: {
      tags: ['Mobile auth'],
      summary: 'Request a login OTP for a registered mobile',
      description: 'While DEMO_OTP is not false, the response includes demoOtp so the app can be used without an SMS gateway.',
      requestBody: json,
      responses: ok,
    },
  },
  '/api/auth/otp/verify': {
    post: { tags: ['Mobile auth'], summary: 'Verify OTP and start a session', requestBody: json, responses: ok },
  },
  '/api/auth/register': {
    post: {
      tags: ['Mobile auth'],
      summary: 'Submit a membership application',
      description: 'New applications stay pending until a superadmin approves them in the panel.',
      requestBody: json,
      responses: ok,
    },
  },
  '/api/auth/me': {
    get: { tags: ['Mobile'], summary: 'Current member profile', security: bearer, responses: ok },
  },
  '/api/home': { get: { tags: ['Mobile'], summary: 'Home banners, balance, and unread count', security: bearer, responses: ok } },
  '/api/notices': { get: { tags: ['Mobile'], summary: 'Notice board', security: bearer, responses: ok } },
  '/api/facilities': { get: { tags: ['Mobile'], summary: 'Facilities', security: bearer, responses: ok } },
  '/api/clubs': { get: { tags: ['Mobile'], summary: 'Chapters', security: bearer, responses: ok } },
  '/api/members/circle': { get: { tags: ['Mobile'], summary: 'Member circle (name, firm, city, category only)', security: bearer, responses: ok } },
  '/api/events': { get: { tags: ['Mobile'], summary: 'Events. Query tab=upcoming|booked|past', security: bearer, responses: ok } },
  '/api/events/{id}/book': {
    post: {
      tags: ['Mobile'],
      summary: 'Book an event and issue a ticket',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: ok,
    },
  },
  '/api/gallery': { get: { tags: ['Mobile'], summary: 'Gallery', security: bearer, responses: ok } },
  '/api/packages': { get: { tags: ['Mobile'], summary: 'Packages', security: bearer, responses: ok } },
  '/api/packages/{id}/enquire': {
    post: {
      tags: ['Mobile'],
      summary: 'Request a package',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: json,
      responses: ok,
    },
  },
  '/api/directory': { get: { tags: ['Mobile'], summary: 'Directory', security: bearer, responses: ok } },
  '/api/transactions': { get: { tags: ['Mobile'], summary: 'Transaction history and balance', security: bearer, responses: ok } },
  '/api/payments': { post: { tags: ['Mobile'], summary: 'Tap to Pay. Records a receipt and reduces dues', security: bearer, requestBody: json, responses: ok } },
  '/api/tickets': { get: { tags: ['Mobile'], summary: 'My tickets', security: bearer, responses: ok } },
  '/api/room-bookings': {
    get: { tags: ['Mobile'], summary: 'My room requests', security: bearer, responses: ok },
    post: { tags: ['Mobile'], summary: 'Request a room', security: bearer, requestBody: json, responses: ok },
  },
  '/api/notifications': { get: { tags: ['Mobile'], summary: 'Notifications', security: bearer, responses: ok } },
  '/api/notifications/{id}/read': {
    post: {
      tags: ['Mobile'],
      summary: 'Mark a notification read',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: ok,
    },
  },
  '/api/admin/login': {
    post: {
      tags: ['Admin'],
      summary: 'Superadmin sign in',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', example: 'admin@ddaoi.org' },
                password: { type: 'string', example: 'Admin@123' },
              },
            },
          },
        },
      },
      responses: ok,
    },
  },
  '/api/admin/me': { get: { tags: ['Admin'], summary: 'Current superadmin', security: bearer, responses: ok } },
  '/api/admin/dashboard': { get: { tags: ['Admin'], summary: 'Panel counts and recent rows', security: bearer, responses: ok } },
  '/api/admin/meta': { get: { tags: ['Admin'], summary: 'Master types used by the panel', security: bearer, responses: ok } },
  '/api/admin/upload': {
    post: {
      tags: ['Admin'],
      summary: 'Upload a banner, gallery, or club image',
      security: bearer,
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
      responses: ok,
    },
  },
};

resources.forEach(([name, summary]) => Object.assign(paths, crud(name, summary)));

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Dholera Dealers Association of India',
    version: '1.0.0',
    description: 'APIs for the Dholera mobile app and the superadmin panel. Send the token as Authorization: Bearer.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Public' },
    { name: 'Mobile auth' },
    { name: 'Mobile' },
    { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths,
};
