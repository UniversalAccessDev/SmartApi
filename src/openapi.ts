import { API_PREFIX, MODEL_NAME, PRODUCT_NAME, TAGLINE } from './constants'

/**
 * OpenAPI 3.0 description of the Smart API surface. Served as JSON at
 * GET /openapi.json and rendered as interactive docs at GET /docs. Kept as a
 * plain object (no codegen) so it is trivial to read and edit alongside routes.
 */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: `${PRODUCT_NAME} API`,
    version: '1.0.0',
    description: `${TAGLINE}\n\nDeterministic: the same input always yields the same Playwright output. No AI, no flaky calls.`,
    contact: { name: 'AtwalLabs', url: 'https://smartapi.atwallabs.com' },
  },
  servers: [{ url: 'https://smartapi.atwallabs.com', description: 'Production' }],
  tags: [
    { name: 'Generation', description: 'Turn plain-English steps into Playwright code' },
    { name: 'Knowledge Base', description: 'Per-org learned locators' },
    { name: 'Observability', description: 'Health and usage' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description:
          'API key. Required on all /api/v1 endpoints when the server has keys configured.',
      },
    },
    parameters: {
      OrgId: {
        name: 'x-org-id',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description:
          "Optional org id. When present, that org's knowledge base is consulted before the generic rules.",
      },
    },
    schemas: {
      GenerateRequest: {
        type: 'object',
        required: ['testName', 'url', 'steps'],
        properties: {
          testName: { type: 'string', minLength: 1, maxLength: 200, example: 'Checkout flow' },
          url: { type: 'string', format: 'uri', example: 'https://example.com' },
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'string', minLength: 1 },
            example: [
              "Click the 'Add to Cart' button",
              'In the row for Jane Doe, click Edit',
              'The Submit button should be disabled',
              'Verify I get redirected to /checkout',
            ],
          },
          language: { type: 'string', enum: ['typescript', 'javascript'], default: 'typescript' },
          includeScreenshots: { type: 'boolean', default: false },
          closeOverlaysWithEscape: { type: 'boolean', default: false },
          outputFormat: {
            type: 'string',
            enum: ['playwright', 'actions'],
            default: 'playwright',
            description:
              '"playwright" returns code (string). "actions" returns a structured action-JSON array for executors that do not run Playwright directly.',
          },
        },
      },
      Action: {
        type: 'object',
        description: 'One executor action. `note` carries un-mappable steps/assertions verbatim.',
        properties: {
          type: {
            type: 'string',
            enum: [
              'goto',
              'fill',
              'click',
              'hover',
              'wait',
              'press',
              'screenshot',
              'assertTitle',
              'assertUrl',
              'assertVisible',
              'conditionalclick',
              'note',
            ],
          },
          guard: {
            type: 'object',
            description: 'conditionalclick: element that must be visible for the click to run',
            properties: {
              by: { type: 'string', enum: ['text', 'label', 'css', 'xpath', 'id'] },
              value: { type: 'string' },
            },
          },
          click: {
            type: 'object',
            description: 'conditionalclick: the click action performed when the guard is visible',
          },
          url: { type: 'string' },
          ms: { type: 'integer' },
          key: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'string' },
          contains: { type: 'string' },
          text: { type: 'string' },
          target: {
            type: 'object',
            properties: {
              by: { type: 'string', enum: ['text', 'label', 'css', 'xpath', 'id'] },
              value: { type: 'string' },
            },
          },
        },
      },
      AnalyzedStep: {
        type: 'object',
        properties: {
          step: { type: 'string' },
          rule: {
            type: 'string',
            nullable: true,
            description: 'Matched rule name, or null if unmapped',
          },
          confidence: { type: 'number', format: 'float' },
          level: { type: 'string', enum: ['high', 'medium', 'low'] },
          strategy: {
            type: 'string',
            nullable: true,
            enum: [
              'role',
              'label',
              'placeholder',
              'text',
              'testid',
              'css',
              'xpath',
              'frame',
              'keyboard',
              'url',
            ],
          },
          code: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string', description: 'Why this locator/action was chosen' },
          alternatives: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fallback locators to try',
          },
        },
      },
      ConfidenceSummary: {
        type: 'object',
        properties: {
          score: { type: 'number', format: 'float' },
          level: { type: 'string', enum: ['high', 'medium', 'low'] },
          breakdown: {
            type: 'object',
            properties: {
              high: { type: 'integer' },
              medium: { type: 'integer' },
              low: { type: 'integer' },
            },
          },
          unmappedSteps: { type: 'integer' },
          note: { type: 'string' },
        },
      },
      GenerateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          model: { type: 'string', example: MODEL_NAME },
          tagline: { type: 'string' },
          org: { type: 'string', nullable: true },
          language: { type: 'string', example: 'typescript' },
          outputFormat: { type: 'string', enum: ['playwright', 'actions'] },
          code: {
            type: 'string',
            description: 'Generated Playwright test file (present when outputFormat=playwright)',
          },
          actions: {
            type: 'array',
            items: { $ref: '#/components/schemas/Action' },
            description: 'Structured actions (present when outputFormat=actions)',
          },
          locatorStrategy: { type: 'string', example: 'role-label-url' },
          confidenceScore: { type: 'number', format: 'float', example: 0.82 },
          confidence: { $ref: '#/components/schemas/ConfidenceSummary' },
          assumptions: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          validation: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
          meta: {
            type: 'object',
            properties: {
              stepsAnalyzed: {
                type: 'array',
                items: { $ref: '#/components/schemas/AnalyzedStep' },
              },
              unmatchedSteps: { type: 'array', items: { type: 'string' } },
              ruleEngineWarnings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          model: { type: 'string', example: MODEL_NAME },
          error: { type: 'string', example: 'ValidationError' },
          code: {
            type: 'string',
            example: 'VALIDATION_ERROR',
            description: 'Stable machine-readable error code',
          },
          message: { type: 'string' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Observability'],
        summary: 'Liveness check',
        security: [],
        responses: { '200': { description: 'Service is up' } },
      },
    },
    [`${API_PREFIX}/playwright/generate`]: {
      post: {
        tags: ['Generation'],
        summary: 'Generate Playwright code from plain-English steps',
        parameters: [{ $ref: '#/components/parameters/OrgId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/GenerateRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Generated code with per-step explainability and confidence',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '400': {
            description: 'Validation error (field-level issues)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Missing or invalid API key',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    [`${API_PREFIX}/usage`]: {
      get: {
        tags: ['Observability'],
        summary: 'Usage summary (totals, by endpoint/org/day)',
        responses: { '200': { description: 'Usage rollup' } },
      },
    },
    [`${API_PREFIX}/kb/{org}/teach`]: {
      post: {
        tags: ['Knowledge Base'],
        summary: 'Teach a single phrase -> locator for an org',
        parameters: [{ name: 'org', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stored' } },
      },
    },
    [`${API_PREFIX}/kb/{org}`]: {
      get: {
        tags: ['Knowledge Base'],
        summary: "List an org's learned entries",
        parameters: [{ name: 'org', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Entries' } },
      },
    },
  },
} as const

/** Self-contained HTML docs page (Redoc via CDN — no runtime dependency). */
export const docsHtml = `<!doctype html>
<html>
  <head>
    <title>${PRODUCT_NAME} — API Docs</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`
