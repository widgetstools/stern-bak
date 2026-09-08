/**
 * Wire schemas for the scenario tools.
 *
 * The descriptions carry more weight than usual here, because the capability
 * is unfamiliar. A model that has only ever seen risk systems will reach for
 * these as though they were stress tests and describe the output as "if rates
 * rose 50bp"; they are not that, and saying so in the schema is what stops it.
 * Units are spelled out for the same reason — `level: 0.5` is fifty basis
 * points, and a model that guesses percent instead is off by a hundred.
 */
import type { OpenAIToolSchema } from './toolSchemaShared';

const SHOCK_PROPERTY = {
  type: 'object',
  description:
    'A deliberate push applied on top of the world\'s own randomness, and PERSISTENT — it changes the world rather than bumping it for one day. All moves are in PERCENT: level 0.5 is +50bp across the curve, credit 0.2 is a 20% relative widening of spreads (so 30bp on a 150bp bond and 120bp on a 600bp one).',
  properties: {
    level: { type: 'number', description: 'Parallel curve move in percent. 0.5 = +50bp.' },
    slope: { type: 'number', description: 'Slope factor move in percent. Negative steepens the front end.' },
    curvature: { type: 'number', description: 'Curvature factor move in percent — a belly move.' },
    credit: {
      type: 'number',
      description:
        'Systematic credit factor move in LOG space, so it is a RELATIVE widening: 0.2 widens every spread by about 20% of its own level. Use this rather than an absolute basis-point number, which would be wrong for one of investment grade or high yield whichever you picked it for.',
    },
    volMultiplier: {
      type: 'number',
      description: 'Scales every random draw. 2 runs the world at double volatility. Clamped to 0.1-10.',
    },
    onDay: {
      type: 'number',
      description: 'Business day within the horizon that the shock lands on. 0 is the first day.',
    },
  },
  additionalProperties: false,
} as const;

export const SCENARIO_TOOL_SCHEMAS: OpenAIToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'describe_book',
      description:
        'Summarise the fixed-income book the scenario engine runs against: position count, market value and the split by asset class. Call this first when the user asks anything about "my book", "my risk" or "the portfolio" and you do not already know its shape. It also confirms the trading service is reachable.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_scenarios',
      description:
        'Fork the market into many independent worlds, replay each one forward through the factor model, and return the distribution of outcomes for the book.\n\nThis is NOT a stress test and must not be described as one. A stress test bumps today\'s frozen book by DV01 x dy. This re-runs the model that produced the book, so each world is a genuinely different but internally consistent history: prepayments burn out differently, ratings migrate in different weeks, spreads decompose differently. Say "re-simulated worlds", not "if rates rose".\n\nThe answer is a distribution — median, 5th percentile, expected shortfall, worst — plus the factor path of the worst worlds, so you can explain WHY the book lost rather than only how much. Use it for "what could happen", "how bad could it get", "what is my risk over the next month".',
      parameters: {
        type: 'object',
        properties: {
          worlds: {
            type: 'number',
            description: 'Independent worlds to replay. Default 200. More is a tighter tail estimate and a longer wait; 500 takes a few seconds. Capped at 1000.',
          },
          horizonDays: {
            type: 'number',
            description: 'Business days to replay. Default 20 (about a month). 63 is a quarter, 252 a year. Capped at 252.',
          },
          reportWorst: {
            type: 'number',
            description: 'How many of the worst worlds to describe in full, with attribution. Default 3.',
          },
          shock: SHOCK_PROPERTY,
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_worst_case',
      description:
        'Search the factor space for the move that hurts THIS book most, subject to a plausibility bound, and explain why this book is exposed to it.\n\nThis is reverse stress testing, and it is the opposite of applying a stored scenario. It does not ask what 2008 does to the book; it solves for the direction the book is actually exposed to, on the boundary of the factor covariance ellipsoid. The answer is book-dependent: a muni and rates book is searched almost entirely along the curve, a high-yield book almost entirely along credit. Use it for "what is the worst that could happen", "where am I most exposed", "what should I be worried about".\n\nIt reports both the linear prediction and the full revaluation, so the convexity effect is visible — which is the interesting part for a mortgage book.',
      parameters: {
        type: 'object',
        properties: {
          horizonDays: {
            type: 'number',
            description: 'Business days the move plays out over. Default 20. A longer horizon allows a larger move, because the factors have more time to travel.',
          },
          radius: {
            type: 'number',
            description: 'How far into the tail to look, in joint standard deviations. Default 2.5, which is roughly a one-in-a-hundred move. 3.5 is a crisis. Clamped to 0.5-6.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fork_market',
      description:
        'Replay one specific counterfactual and report what it cost, with every other random draw held identical.\n\nThis is the tool for "re-run last month with the CPI print 30bp hotter" or "what if spreads had gapped in week two". Because the same world is replayed with and without the shock, the difference IS the shock and nothing else — not the shock plus whatever the random draw happened to do. That is something no trading system can normally answer, because a real system has only one history.\n\nUse `run_scenarios` when the question is "what could happen"; use this when the question names a specific alternative.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'What to call this counterfactual, e.g. "CPI 30bp hotter". Shown to the user.',
          },
          horizonDays: { type: 'number', description: 'Business days to replay. Default 20.' },
          worlds: {
            type: 'number',
            description: 'Worlds to average the comparison over. Default 1, which is the cleanest comparison because it holds one specific history fixed. Raise it only if the user wants the counterfactual averaged.',
          },
          shock: SHOCK_PROPERTY,
        },
        required: ['shock'],
        additionalProperties: false,
      },
    },
  },
];
