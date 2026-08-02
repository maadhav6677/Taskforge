export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'TaskForge API',
    version: '0.1.0',
    description: 'Versioned API for authenticated asynchronous task execution.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth' },
    { name: 'Tasks' },
    { name: 'Dashboard' },
    { name: 'Admin' },
    { name: 'Operations' },
  ],
  paths: {
    '/auth/csrf': {
      get: {
        tags: ['Auth'],
        summary: 'Issue a browser CSRF cookie',
        responses: { '204': { description: 'Issued' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a user and create a session',
        requestBody: { $ref: '#/components/requestBodies/Credentials' },
        responses: {
          '201': { description: 'Registered' },
          '409': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Create a session',
        requestBody: { $ref: '#/components/requestBodies/Credentials' },
        responses: {
          '200': { description: 'Authenticated' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh session',
        responses: {
          '200': { description: 'Rotated' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the session',
        responses: { '204': { description: 'Revoked' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Read the current user',
        responses: {
          '200': { description: 'Current user' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Read owned task counts',
        responses: { '200': { description: 'Summary' } },
      },
    },
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'Search and paginate owned tasks',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 160 } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/TaskStatus' } },
          { name: 'type', in: 'query', schema: { $ref: '#/components/schemas/TaskType' } },
          { name: 'scheduled', in: 'query', schema: { type: 'boolean' } },
          { name: 'createdFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'createdTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['createdAt', 'updatedAt', 'scheduledAt', 'status', 'title'],
              default: 'createdAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: { '200': { description: 'Task page' } },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Persist and asynchronously dispatch a task',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateTextTask' } },
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['task', 'attachments'],
                properties: {
                  task: { type: 'string' },
                  attachments: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    maxItems: 5,
                  },
                },
              },
            },
          },
        },
        responses: {
          '202': { description: 'Accepted' },
          '422': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/tasks/{id}': {
      parameters: [{ $ref: '#/components/parameters/TaskId' }],
      get: {
        tags: ['Tasks'],
        summary: 'Read an owned task with safe attachment metadata',
        responses: {
          '200': { description: 'Task' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
      patch: {
        tags: ['Tasks'],
        summary: 'Update a pending task',
        parameters: [{ $ref: '#/components/parameters/IfMatch' }],
        responses: {
          '200': { description: 'Updated' },
          '409': { $ref: '#/components/responses/Error' },
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Soft-delete an eligible task',
        parameters: [{ $ref: '#/components/parameters/IfMatch' }],
        responses: {
          '204': { description: 'Deleted' },
          '409': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/tasks/{id}/retry': {
      post: {
        tags: ['Tasks'],
        summary: 'Manually retry a failed task',
        parameters: [
          { $ref: '#/components/parameters/TaskId' },
          { $ref: '#/components/parameters/IfMatch' },
        ],
        responses: {
          '202': { description: 'Accepted' },
          '409': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/tasks/{id}/history': {
      get: {
        tags: ['Tasks'],
        summary: 'Read append-only history',
        parameters: [{ $ref: '#/components/parameters/TaskId' }],
        responses: { '200': { description: 'History' } },
      },
    },
    '/files/{id}/download': {
      get: {
        tags: ['Tasks'],
        summary: 'Download an owned private attachment',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'File bytes' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/admin/dashboard/summary': {
      get: {
        tags: ['Admin'],
        summary: 'Read system task counts',
        responses: {
          '200': { description: 'Summary' },
          '403': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/admin/tasks': {
      get: {
        tags: ['Admin'],
        summary: 'Read system-wide tasks',
        responses: {
          '200': { description: 'Task page' },
          '403': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Operations'],
        summary: 'Process liveness',
        responses: { '200': { description: 'Alive' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Operations'],
        summary: 'Required dependency readiness',
        responses: {
          '200': { description: 'Ready' },
          '503': { $ref: '#/components/responses/Error' },
        },
      },
    },
  },
  components: {
    parameters: {
      TaskId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      IfMatch: {
        name: 'If-Match',
        in: 'header',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
    },
    requestBodies: {
      Credentials: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', maxLength: 320 },
                password: { type: 'string', minLength: 12, maxLength: 128 },
              },
            },
          },
        },
      },
    },
    responses: {
      Error: {
        description: 'Public error envelope',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
      },
    },
    schemas: {
      TaskStatus: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
      TaskType: { type: 'string', enum: ['TEXT_PROCESSING', 'FILE_INSPECTION'] },
      CreateTextTask: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'type', 'input'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string', maxLength: 2000 },
          type: { const: 'TEXT_PROCESSING' },
          input: {
            type: 'object',
            additionalProperties: false,
            required: ['text'],
            properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
          },
          scheduledAt: { type: 'string', format: 'date-time' },
          maxAttempts: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['error', 'requestId'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: {} },
            },
          },
          requestId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
} as const;
