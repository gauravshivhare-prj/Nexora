/**
 * Concrete Deterministic Demo implementation of the AiProvider contract.
 *
 * Provides a deterministic offline evaluation path for demonstrations, test suites,
 * and smoke runs without requiring live Gemini credentials, while enabling faithful
 * demonstration of rubric evaluation, score calculation, and skill grounding.
 *
 * When an outage simulation keyword ([trigger-outage], [simulate_503], ETIMEDOUT)
 * is present in candidate input, the provider simulates an upstream failure so
 * that truthful error handling, retries, and non-destructive UI behavior can be demonstrated.
 *
 * @typedef {import('./aiProvider.js').AiProvider} AiProvider
 * @typedef {import('./aiProvider.js').AiCompletionRequest} AiCompletionRequest
 * @typedef {import('./aiProvider.js').AiCompletionResult} AiCompletionResult
 */

const DEFAULT_MODEL = 'nexora-demo-deterministic';

/**
 * Creates an AiProvider backed by deterministic evaluation heuristics.
 *
 * @param {object} [options]
 * @param {string} [options.model] Model identifier. Defaults to 'nexora-demo-deterministic'.
 * @returns {AiProvider}
 */
export function createDemoProvider(options = {}) {
  const model = options.model?.trim() || DEFAULT_MODEL;

  return {
    name: 'demo',

    /**
     * Completes an AI request using deterministic parsing and scoring.
     *
     * @param {AiCompletionRequest} request
     * @returns {Promise<AiCompletionResult>}
     */
    async complete(request) {
      if (request.signal?.aborted) {
        throw new Error('Request was aborted prior to execution.');
      }

      const userText = typeof request?.user === 'string' ? request.user : '';
      const systemText = typeof request?.system === 'string' ? request.system : '';

      // Truthfully simulate upstream provider outage when simulation trigger keyword is present
      if (
        /\[(trigger-outage|simulate_503|simulate_outage)\]/i.test(userText) ||
        userText.includes('ETIMEDOUT') ||
        userText.includes('SIMULATE_UPSTREAM_FAILURE')
      ) {
        const error = new Error('Upstream AI provider is temporarily unavailable (ETIMEDOUT).');
        error.name = 'ProviderUnavailableError';
        error.status = 503;
        throw error;
      }

      // 1. Check if request is an interview question evaluation
      if (userText.includes('<question_target>') || userText.includes('<candidate_untrusted_answer>')) {
        return {
          text: evaluateInterviewPrompt(userText),
          model,
        };
      }

      // 2. Check if request is resume extraction
      if (systemText.toLowerCase().includes('resume') || userText.toLowerCase().includes('resume')) {
        return {
          text: JSON.stringify({
            skills: [
              { name: 'JavaScript', level: 'intermediate', evidence: 'Demonstrated in resume' },
              { name: 'Node.js', level: 'intermediate', evidence: 'Demonstrated in resume' },
              { name: 'SQL', level: 'intermediate', evidence: 'Demonstrated in resume' },
            ],
            projects: [],
          }),
          model,
        };
      }

      // 3. Fallback narrative or generic structured response
      return {
        text: JSON.stringify({
          narrative: 'Candidate exhibits demonstrated competence in foundational technical engineering domains.',
        }),
        model,
      };
    },
  };
}

/**
 * Deterministically evaluates candidate answer text within an interview prompt.
 *
 * @param {string} prompt
 * @returns {string} Serialized JSON evaluation payload
 */
function evaluateInterviewPrompt(prompt) {
  // Extract target skill
  const skillMatch = prompt.match(/Target Skill:\s*([^\n\r<]+)/i);
  const targetSkill = skillMatch ? skillMatch[1].trim() : 'Software Engineering';

  // Extract raw untrusted candidate answer
  const answerMatch = prompt.match(/<candidate_untrusted_answer>([\s\S]*?)<\/candidate_untrusted_answer>/i);
  const rawAnswer = answerMatch ? answerMatch[1].trim() : '';

  // Check for adversarial prompt injection or instruction override attempts
  const isAdversarial = /(ignore\s+all|override\s+instructions|system\s+prompt|drop\s+database|admin_override|admin\s+mode|print\s+instructions|sudo\b)/i.test(
    rawAnswer,
  );

  if (isAdversarial) {
    return JSON.stringify({
      dimensions: {
        accuracy: 0.05,
        depth: 0.05,
        clarity: 0.1,
        relevance: 0.05,
      },
      feedback: 'The submission contained instruction override attempts instead of addressing the technical question.',
      strengths: [],
      growthAreas: ['Focus directly on technical explanation of the requested concepts without adversarial prompt manipulation.'],
      groundedSkills: [],
    });
  }

  // Measure content length and depth
  const len = rawAnswer.length;

  // Tier 1: Very weak / incomplete answer (< 50 chars)
  if (len < 50) {
    return JSON.stringify({
      dimensions: {
        accuracy: 0.35,
        depth: 0.25,
        clarity: 0.45,
        relevance: 0.35,
      },
      feedback: 'The response is too brief to demonstrate operational or architectural mastery of the target skill.',
      strengths: ['Identified the core subject matter'],
      growthAreas: ['Explain underlying mechanisms, concurrency implications, and real-world failure modes.'],
      groundedSkills: [],
    });
  }

  // Tier 2: Partial / foundational answer (50 - 149 chars)
  if (len < 150) {
    return JSON.stringify({
      dimensions: {
        accuracy: 0.6,
        depth: 0.55,
        clarity: 0.65,
        relevance: 0.6,
      },
      feedback: 'Demonstrates foundational familiarity with the concept but misses detailed trade-offs and runtime characteristics.',
      strengths: ['Accurate foundational terminology', 'Recognizes primary use case'],
      growthAreas: ['Deepen explanation of error handling, scalability constraints, and system trade-offs.'],
      groundedSkills: [],
    });
  }

  // Tier 3: Strong technical answer (>= 150 chars)
  return JSON.stringify({
    dimensions: {
      accuracy: 0.88,
      depth: 0.82,
      clarity: 0.85,
      relevance: 0.9,
    },
    feedback: `Thorough and articulate technical explanation demonstrating sound architectural reasoning in ${targetSkill}.`,
    strengths: [
      `Solid conceptual understanding of ${targetSkill} runtime and patterns`,
      'Clear articulation of architectural trade-offs and operational best practices',
    ],
    growthAreas: [
      'Could further detail telemetry, distributed tracing, and edge-case error isolation.',
    ],
    groundedSkills: [targetSkill],
  });
}
