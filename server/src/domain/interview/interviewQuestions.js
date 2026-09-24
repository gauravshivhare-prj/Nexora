import {
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_VALUES,
} from './interviewContract.js';
import { canonicalSkill } from '../skills/skillKey.js';
import { CAREER_ROLES, findRole } from '../careers/roleCatalogue.js';

/**
 * Version of the curated interview question bank.
 * Increment whenever questions are added, updated, or deprecated.
 */
export const QUESTION_BANK_VERSION = 1;

/**
 * Curated question bank for technical and behavioral interviews.
 *
 * Designed with:
 * - Stable, immutable IDs (never reused or repurposed).
 * - Separation of candidate-facing intent from evaluator criteria.
 * - Strict alignment with Nexora's canonical skill taxonomy and career roles.
 */
export const INTERVIEW_QUESTION_BANK = Object.freeze([
  // ==========================================
  // Node.js
  // ==========================================
  {
    id: 'iq-node-001',
    version: 1,
    targetSkill: 'Node.js',
    skillKey: 'nodejs',
    roles: ['backend-developer', 'full-stack-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Assess candidate understanding of Node.js event loop phases and scheduling.',
      prompt:
        'Walk through the primary phases of the Node.js event loop and explain how microtasks (Promises and process.nextTick) are scheduled relative to macrotasks.',
      context:
        'Evaluates whether candidate understands asynchronous non-blocking I/O beyond basic callbacks.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Names key event loop phases (timers, poll, check, close)',
        'Explains that microtasks drain after each phase or macrotask completion',
        'Distinguishes process.nextTick priority over standard Promise microtasks',
        'Identifies the role of libuv in event loop management',
      ],
      expectedKeyConcepts: [
        'timers phase',
        'poll phase',
        'check phase (setImmediate)',
        'microtask queue',
        'process.nextTick',
        'libuv',
      ],
      commonMisconceptions: [
        'Believing JavaScript executes concurrently on multiple threads',
        'Assuming setTimeout(fn, 0) runs with true zero millisecond delay',
        'Confusing call stack execution with the event loop queue',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate description of phase order and microtask drain rules.',
        depth: 'References libuv threadpool and OS-level non-blocking sockets.',
        clarity: 'Explains execution flow chronologically and concisely.',
        relevance: 'Focuses on Node runtime rather than browser DOM APIs.',
      },
    },
  },
  {
    id: 'iq-node-002',
    version: 1,
    targetSkill: 'Node.js',
    skillKey: 'nodejs',
    roles: ['backend-developer', 'full-stack-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Diagnose and remediate event loop blocking in high-throughput services.',
      prompt:
        'Suppose a Node.js microservice experiences sudden latency spikes and health check timeouts whenever a large payload endpoint is called. How would you diagnose whether the event loop is blocked, and what design patterns or architectures would you apply to resolve it?',
      context:
        'Tests production troubleshooting skills, profiling tools, and worker architecture knowledge.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Proposes diagnostic tools such as clinic.js, inspector CPU profiler, or event-loop-lag metrics',
        'Identifies CPU-bound hazards (e.g. synchronous JSON parse/stringify, regex DoS, cryptographic hashing)',
        'Recommends offloading strategies: worker threads, child processes, or external worker queues',
        'Mentions streaming JSON parsing or chunking work via setImmediate',
      ],
      expectedKeyConcepts: [
        'event loop delay / lag',
        'worker_threads',
        'CPU-bound tasks',
        'streaming processing',
        'profiling / clinic.js',
      ],
      commonMisconceptions: [
        'Assuming wrapping synchronous code in a Promise makes it non-blocking',
        'Adding more RAM to resolve a CPU-bound single-thread block',
      ],
      scoringGuidelines: {
        accuracy: 'Correctly identifies that Promises do not free the main thread.',
        depth: 'Compares worker_threads with separate microservice processes.',
        clarity: 'Presents a systematic diagnose-then-remediate roadmap.',
        relevance: 'Directly addresses production timeout scenario.',
      },
    },
  },
  {
    id: 'iq-node-003',
    version: 1,
    targetSkill: 'Node.js',
    skillKey: 'nodejs',
    roles: ['backend-developer', 'full-stack-developer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 120,
    intent: {
      summary: 'Compare process.nextTick and setImmediate scheduling.',
      prompt:
        'What is the practical difference between process.nextTick() and setImmediate() in Node.js, and in what situations would you use one over the other?',
      context: 'Fundamental runtime scheduling question for junior/entry-level engineers.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Identifies that process.nextTick fires before the event loop continues to the next phase',
        'Identifies that setImmediate fires in the check phase of the event loop',
        'Notes that recursive nextTick calls can starve I/O',
      ],
      expectedKeyConcepts: [
        'microtask vs macrotask',
        'check phase',
        'I/O starvation',
      ],
      commonMisconceptions: [
        'Thinking setImmediate runs earlier than nextTick because of its name',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate distinction between immediate check phase and nextTick queue.',
        depth: 'Mentions potential event loop starvation risk.',
        clarity: 'Concise explanation with simple code flow.',
        relevance: 'Direct comparison without extraneous trivia.',
      },
    },
  },

  // ==========================================
  // JavaScript
  // ==========================================
  {
    id: 'iq-js-001',
    version: 1,
    targetSkill: 'JavaScript',
    skillKey: 'javascript',
    roles: ['frontend-developer', 'backend-developer', 'full-stack-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Assess understanding of JavaScript closures and memory retention.',
      prompt:
        'What is a closure in JavaScript, how does lexical scoping make it work, and what are common scenarios where closures cause accidental memory leaks?',
      context: 'Core language semantics and memory awareness evaluation.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines closure as a function bundled with references to its surrounding lexical environment',
        'Explains that inner functions retain access to outer variables even after the outer function has returned',
        'Identifies memory leak pitfalls (uncleaned event listeners, detached DOM nodes, retained large scopes)',
      ],
      expectedKeyConcepts: [
        'lexical environment',
        'variable lifetime',
        'garbage collection',
        'memory leaks / detached references',
      ],
      commonMisconceptions: [
        'Confusing closure with standard function parameter passing or callback syntax',
        'Believing closures are only created with IIFEs or arrow functions',
      ],
      scoringGuidelines: {
        accuracy: 'Clear theoretical definition paired with runtime memory implications.',
        depth: 'Explains mark-and-sweep garbage collection interactions.',
        clarity: 'Uses intuitive mental models.',
        relevance: 'Stays focused on JS closures and scoping rules.',
      },
    },
  },
  {
    id: 'iq-js-002',
    version: 1,
    targetSkill: 'JavaScript',
    skillKey: 'javascript',
    roles: ['frontend-developer', 'backend-developer', 'full-stack-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Assess asynchronous concurrency control and promise pooling.',
      prompt:
        'If you need to fetch 1000 URLs in Node.js or the browser, why is Promise.all() dangerous, and how would you implement a concurrency pool or queue to throttle requests to a maximum of 5 concurrent operations?',
      context: 'Checks algorithmic design in asynchronous environments and resource management.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Identifies Promise.all hazards: socket exhaustion, rate limiting (429), memory bloat',
        'Outlines a pool pattern with an active count, queue of pending tasks, and recursion on resolution',
        'Handles promise rejections without crashing the entire batch (or explains Promise.allSettled)',
      ],
      expectedKeyConcepts: [
        'concurrency limit / throttling',
        'socket exhaustion',
        'Promise.allSettled',
        'worker pool pattern',
      ],
      commonMisconceptions: [
        'Thinking Promise.all automatically runs tasks sequentially',
        'Thinking Array.prototype.forEach with async/await enforces concurrency limits',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate critique of Promise.all and correct concurrency logic.',
        depth: 'Discusses backpressure and error propagation.',
        clarity: 'Explains step-by-step queue execution.',
        relevance: 'Focused on async concurrency control.',
      },
    },
  },

  // ==========================================
  // React
  // ==========================================
  {
    id: 'iq-react-001',
    version: 1,
    targetSkill: 'React',
    skillKey: 'react',
    roles: ['frontend-developer', 'full-stack-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Evaluate knowledge of React reconciliation, virtual DOM, and key prop mechanics.',
      prompt:
        'Explain how React reconciliation works, why the "key" prop is crucial when rendering lists, and what bugs occur if array indices are used as keys in dynamic lists.',
      context: 'Tests fundamental rendering architecture and DOM optimization awareness.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains tree diffing heuristic and component type matching',
        'Explains that keys provide persistent identity between renders across re-orders and deletions',
        'Identifies bugs with index keys: misplaced uncontrolled component state, incorrect animation transitions',
      ],
      expectedKeyConcepts: [
        'reconciliation / fiber',
        'virtual DOM diffing',
        'element identity',
        'uncontrolled input state preservation',
      ],
      commonMisconceptions: [
        'Thinking the key prop is passed down as a regular component prop',
        'Believing keys are only for performance rather than state identity',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate description of heuristic diffing and key role in element identity.',
        depth: 'Explains internal fiber reconciliation and state mapping.',
        clarity: 'Clear real-world list modification example.',
        relevance: 'Strictly relates to React rendering engine.',
      },
    },
  },
  {
    id: 'iq-react-002',
    version: 1,
    targetSkill: 'React',
    skillKey: 'react',
    roles: ['frontend-developer', 'full-stack-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Profile and optimize unnecessary re-renders in a complex React dashboard.',
      prompt:
        'A large interactive data dashboard feels sluggish on user input. How would you use React DevTools Profiler to locate unnecessary re-renders, and what architectural strategies (state colocation, memoization, context splitting) would you apply?',
      context: 'Evaluates production frontend performance profiling and clean architecture.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Mentions DevTools Profiler: recording commits, "Why did this render?", flamegraph inspections',
        'Suggests state colocation (pushing state down to where it is consumed)',
        'Applies React.memo, useMemo, and useCallback appropriately with stable dependencies',
        'Discusses Context splitting to prevent consumers re-rendering on unrelated updates',
      ],
      expectedKeyConcepts: [
        'React DevTools Profiler',
        'state colocation',
        'context splitting',
        'memoization (React.memo, useMemo)',
        'component composition (children prop)',
      ],
      commonMisconceptions: [
        'Wrapping every single function and variable in useCallback/useMemo indiscriminately',
        'Assuming pure re-renders always cause real DOM mutations',
      ],
      scoringGuidelines: {
        accuracy: 'Understands root cause of render propagation down component subtrees.',
        depth: 'Recommends component composition before premature memoization.',
        clarity: 'Structured optimization methodology.',
        relevance: 'Addresses the dashboard scenario directly.',
      },
    },
  },

  // ==========================================
  // SQL
  // ==========================================
  {
    id: 'iq-sql-001',
    version: 1,
    targetSkill: 'SQL',
    skillKey: 'sql',
    roles: ['backend-developer', 'data-analyst', 'full-stack-developer', 'data-scientist'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Evaluate B-Tree indexing mechanisms, composite keys, and EXPLAIN plans.',
      prompt:
        'How does a B-Tree index work in a relational database like PostgreSQL or MySQL, what is the "leftmost prefix" rule for composite indexes, and how do you use EXPLAIN to verify an index is used?',
      context: 'Tests database indexing fundamentals and query optimization skills.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains B-Tree structure: balanced tree, logarithmic lookup, leaf node linked list for range scans',
        'Defines leftmost prefix rule: composite index on (A, B) cannot accelerate queries filtering only on B',
        'Describes EXPLAIN output: Index Scan vs Seq Scan (table scan) and cost estimation',
      ],
      expectedKeyConcepts: [
        'B-Tree index structure',
        'leftmost prefix rule',
        'Index Scan vs Sequential Scan',
        'EXPLAIN / EXPLAIN ANALYZE',
      ],
      commonMisconceptions: [
        'Believing indexing every single column individually speeds up all queries',
        'Thinking EXPLAIN and EXPLAIN ANALYZE both execute the query in full (EXPLAIN alone does not)',
      ],
      scoringGuidelines: {
        accuracy: 'Precise explanation of composite index column ordering.',
        depth: 'Explains difference between index seek, index scan, and table lookup.',
        clarity: 'Visual or structured explanation of tree traversal.',
        relevance: 'Focused on relational indexing mechanics.',
      },
    },
  },
  {
    id: 'iq-sql-002',
    version: 1,
    targetSkill: 'SQL',
    skillKey: 'sql',
    roles: ['backend-developer', 'full-stack-developer', 'data-analyst'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Assess understanding of transaction isolation levels and concurrency anomalies.',
      prompt:
        'Compare the Read Committed, Repeatable Read, and Serializable transaction isolation levels. What concurrency anomalies (dirty read, non-repeatable read, phantom read) does each prevent?',
      context: 'Evaluates transactional integrity and database concurrency guarantees.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines dirty read, non-repeatable read, and phantom read with clear transaction examples',
        'Maps isolation levels correctly to the anomalies they prevent',
        'Mentions trade-offs: data consistency vs throughput and lock contention / serialization failures',
      ],
      expectedKeyConcepts: [
        'ACID transactions',
        'dirty read',
        'non-repeatable read',
        'phantom read',
        'MVCC (Multi-Version Concurrency Control)',
      ],
      commonMisconceptions: [
        'Assuming default isolation level in all databases is Serializable',
        'Thinking Repeatable Read prevents phantom reads in all SQL implementations',
      ],
      scoringGuidelines: {
        accuracy: 'Exact mapping of SQL isolation levels to concurrency anomalies.',
        depth: 'Notes MVCC implementation differences between PostgreSQL and MySQL InnoDB.',
        clarity: 'Concise table or bulleted summary.',
        relevance: 'Focused on database transaction semantics.',
      },
    },
  },

  // ==========================================
  // MongoDB
  // ==========================================
  {
    id: 'iq-mongo-001',
    version: 1,
    targetSkill: 'MongoDB',
    skillKey: 'mongodb',
    roles: ['backend-developer', 'full-stack-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Evaluate embedding vs referencing schema design trade-offs in document databases.',
      prompt:
        'When designing a MongoDB schema, how do you decide whether to embed subdocuments or use document references, and what constraints (such as the 16MB document limit) influence your decision?',
      context: 'Tests data modeling principles in document stores.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Recommends embedding for 1:1 or bounded 1:few relationships accessed together',
        'Recommends referencing for 1:many unbounded relationships or frequently mutated standalone entities',
        'Considers 16MB document size limit and read/write access patterns',
      ],
      expectedKeyConcepts: [
        'embedding vs referencing',
        '16MB BSON limit',
        'access patterns (read-heavy vs write-heavy)',
        'data duplication vs normalization',
      ],
      commonMisconceptions: [
        'Treating MongoDB like a relational database by referencing every single entity with ObjectIds',
        'Ignoring document growth causing costly memory reallocations',
      ],
      scoringGuidelines: {
        accuracy: 'Clear decision matrix based on access patterns and cardinalities.',
        depth: 'Discusses atomic document updates vs multi-document transactions.',
        clarity: 'Provides concrete schema examples (e.g. blog posts and comments).',
        relevance: 'Strictly addresses MongoDB data modeling.',
      },
    },
  },

  // ==========================================
  // Docker
  // ==========================================
  {
    id: 'iq-docker-001',
    version: 1,
    targetSkill: 'Docker',
    skillKey: 'docker',
    roles: ['devops-engineer', 'cloud-engineer', 'backend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Evaluate multi-stage Docker builds, layer caching, and image minimization.',
      prompt:
        'How do multi-stage Docker builds improve container security and image size, and how should you order Dockerfile instructions to maximize layer cache efficiency?',
      context: 'Tests modern containerization best practices and deployment efficiency.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains that build tools, compilers, and devDependencies are discarded in final stage',
        'Describes layer caching: Docker invalidates cache from modified instruction downward',
        'Orders instructions by frequency of change (e.g. copy package.json and npm install before copying src/)',
      ],
      expectedKeyConcepts: [
        'multi-stage builds',
        'layer cache invalidation',
        'attack surface reduction',
        'minimal base images (alpine / distroless)',
      ],
      commonMisconceptions: [
        'Thinking chaining commands in separate RUN steps reduces total image size',
        'Copying application source code before installing package dependencies',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate breakdown of build stages and caching rules.',
        depth: 'Mentions distroless images and non-root execution.',
        clarity: 'Step-by-step Dockerfile instruction ordering.',
        relevance: 'Strictly focuses on Docker optimization.',
      },
    },
  },

  // ==========================================
  // Python
  // ==========================================
  {
    id: 'iq-py-001',
    version: 1,
    targetSkill: 'Python',
    skillKey: 'python',
    roles: ['data-scientist', 'data-analyst', 'backend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Assess understanding of Python GIL, threading, and multiprocessing.',
      prompt:
        'What is the Global Interpreter Lock (GIL) in CPython, why does it prevent CPU-bound threads from running in parallel, and how do you achieve true parallelism for compute-intensive tasks in Python?',
      context: 'Core Python concurrency and performance architecture question.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains that GIL is a mutex preventing multiple native threads from executing Python bytecodes at once',
        'Notes that multithreading is effective for I/O-bound tasks but not CPU-bound tasks',
        'Explains multiprocessing (multiprocessing module, ProcessPoolExecutor) to bypass GIL with separate memory spaces',
      ],
      expectedKeyConcepts: [
        'Global Interpreter Lock (GIL)',
        'CPython memory management / reference counting',
        'I/O bound vs CPU bound',
        'multiprocessing vs multithreading',
      ],
      commonMisconceptions: [
        'Believing Python threads are purely simulated green threads rather than OS native threads',
        'Thinking GIL limits external C-extension calculations (e.g. NumPy releases the GIL during computation)',
      ],
      scoringGuidelines: {
        accuracy: 'Correct explanation of GIL mutex mechanics and thread execution.',
        depth: 'Mentions reference counting thread safety and C-extension GIL release.',
        clarity: 'Clear distinction between I/O bound and CPU bound workloads.',
        relevance: 'Stays grounded in Python runtime fundamentals.',
      },
    },
  },

  // ==========================================
  // REST APIs
  // ==========================================
  {
    id: 'iq-rest-001',
    version: 1,
    targetSkill: 'REST APIs',
    skillKey: 'restapis',
    roles: ['backend-developer', 'full-stack-developer', 'mobile-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Evaluate HTTP idempotency, verbs, and API error status code conventions.',
      prompt:
        'What does idempotency mean in the context of RESTful APIs, which standard HTTP methods are idempotent, and why is POST typically not idempotent while PUT is?',
      context: 'Fundamental HTTP and API contract design evaluation.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines idempotency: making multiple identical requests has the same intended server side effect as a single request',
        'Classifies GET, PUT, DELETE, HEAD, OPTIONS as idempotent, and POST as non-idempotent',
        'Contrasts PUT (complete resource replacement at a specific URI) with POST (subordinate resource creation)',
      ],
      expectedKeyConcepts: [
        'idempotency',
        'safe vs idempotent methods',
        'PUT vs POST semantics',
        'idempotency keys',
      ],
      commonMisconceptions: [
        'Confusing idempotency with identical response bodies (responses may differ, e.g. 200 vs 404 on DELETE)',
        'Thinking PATCH is strictly idempotent by HTTP specification',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate definition of server-side state effect vs client response.',
        depth: 'Discusses payment API idempotency keys in POST requests.',
        clarity: 'Clear method comparison with examples.',
        relevance: 'Strictly addresses RESTful HTTP design principles.',
      },
    },
  },

  // ==========================================
  // Git
  // ==========================================
  {
    id: 'iq-git-001',
    version: 1,
    targetSkill: 'Git',
    skillKey: 'git',
    roles: ['devops-engineer', 'backend-developer', 'frontend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Evaluate branch integration strategies: git merge vs git rebase.',
      prompt:
        'Compare "git merge" with "git rebase" when incorporating upstream changes into a feature branch. What are the trade-offs of each approach, and why is rebasing published shared branches considered dangerous?',
      context: 'Tests version control hygiene and collaborative workflow knowledge.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains that merge preserves exact commit history and branch timeline with a merge commit',
        'Explains that rebase rewrites commit history onto the new base commit, creating a linear history',
        'Identifies the golden rule of rebasing: never rebase commits that have been pushed to a public/shared branch',
      ],
      expectedKeyConcepts: [
        'merge commit vs linear history',
        'rewriting commit SHA hashes',
        'shared branch rebasing hazards',
      ],
      commonMisconceptions: [
        'Thinking rebase removes commits permanently without rewriting them',
      ],
      scoringGuidelines: {
        accuracy: 'Clear explanation of SHA hash rewriting during rebase.',
        depth: 'Mentions reflog recovery and team collaboration impact.',
        clarity: 'Structured trade-off comparison.',
        relevance: 'Focused on standard Git branching workflows.',
      },
    },
  },

  // ==========================================
  // Linux
  // ==========================================
  {
    id: 'iq-linux-001',
    version: 1,
    targetSkill: 'Linux',
    skillKey: 'linux',
    roles: ['devops-engineer', 'cloud-engineer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Assess knowledge of Linux process lifecycle, signals, and termination.',
      prompt:
        'Explain the difference between SIGTERM and SIGKILL in Linux, how an application handles graceful shutdowns upon receiving SIGTERM, and what happens to child processes if their parent is killed?',
      context: 'Crucial for container orchestration, system programming, and reliability.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains that SIGTERM (signal 15) can be caught and handled for cleanup, while SIGKILL (signal 9) cannot be caught or ignored',
        'Describes graceful shutdown steps: stop accepting new requests, drain existing connections, flush buffers',
        'Explains orphan process behavior: adopted by init (PID 1) or subreaper',
      ],
      expectedKeyConcepts: [
        'SIGTERM (15) vs SIGKILL (9)',
        'catchable vs uncatchable signals',
        'graceful shutdown lifecycle',
        'orphan processes / PID 1',
      ],
      commonMisconceptions: [
        'Believing SIGKILL allows an application to run a final database disconnect cleanup hook',
      ],
      scoringGuidelines: {
        accuracy: 'Accurately explains kernel signal delivery mechanics.',
        depth: 'Discusses PID 1 responsibility in container environments.',
        clarity: 'Clear lifecycle description.',
        relevance: 'Focused on Linux process management.',
      },
    },
  },
]);

/** Map of questions indexed by ID for fast constant-time lookup. */
const QUESTIONS_BY_ID = new Map(
  INTERVIEW_QUESTION_BANK.map((q) => [q.id, q]),
);

/**
 * Returns a cloned copy of all questions in the bank.
 *
 * @returns {Array<object>}
 */
export function getAllQuestions() {
  return INTERVIEW_QUESTION_BANK.map((q) => ({ ...q }));
}

/**
 * Retrieves a single question by its unique stable ID.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function getQuestionById(id) {
  if (typeof id !== 'string') return null;
  const found = QUESTIONS_BY_ID.get(id.trim());
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * Returns the set of canonical skill names supported by the question bank.
 *
 * @returns {string[]}
 */
export function getSupportedSkills() {
  return [...new Set(INTERVIEW_QUESTION_BANK.map((q) => q.targetSkill))].sort();
}

/**
 * Checks whether the question bank has curated questions for a given skill.
 *
 * @param {string} skillName
 * @returns {boolean}
 */
export function isSkillSupported(skillName) {
  const canonical = canonicalSkill(skillName);
  if (!canonical) return false;
  return INTERVIEW_QUESTION_BANK.some((q) => q.skillKey === canonical.key);
}

/**
 * Retrieves questions filtered for a specific canonical skill.
 *
 * @param {string} skillName
 * @param {object} [options]
 * @param {string} [options.difficulty]
 * @param {string} [options.roleId]
 * @returns {Array<object>}
 */
export function getQuestionsForSkill(skillName, options = {}) {
  const canonical = canonicalSkill(skillName);
  if (!canonical) {
    throw new Error(`Skill "${skillName}" is not a recognized canonical skill.`);
  }

  const { difficulty, roleId } = options;

  return INTERVIEW_QUESTION_BANK.filter((q) => {
    if (q.skillKey !== canonical.key) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (roleId && !q.roles.includes(roleId)) return false;
    return true;
  }).map((q) => JSON.parse(JSON.stringify(q)));
}

/**
 * Retrieves questions filtered for a specific career role.
 *
 * @param {string} roleId
 * @param {object} [options]
 * @param {string} [options.difficulty]
 * @param {string} [options.skillName]
 * @returns {Array<object>}
 */
export function getQuestionsForRole(roleId, options = {}) {
  const role = findRole(roleId);
  if (!role) {
    throw new Error(`Role "${roleId}" is not a recognized career role in the catalogue.`);
  }

  const { difficulty, skillName } = options;
  const canonical = skillName ? canonicalSkill(skillName) : null;

  return INTERVIEW_QUESTION_BANK.filter((q) => {
    if (!q.roles.includes(roleId)) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (canonical && q.skillKey !== canonical.key) return false;
    return true;
  }).map((q) => JSON.parse(JSON.stringify(q)));
}

/**
 * Simple deterministic pseudo-random number generator using Mulberry32 algorithm.
 *
 * @param {number} seed
 * @returns {() => number} Returns float in [0, 1)
 */
function createMulberry32Prng(seed) {
  let s = seed | 0;
  return function nextRandom() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hashes a string seed to a 32-bit integer.
 *
 * @param {string} str
 * @returns {number}
 */
function hashStringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Deterministically selects interview questions for an interview session.
 *
 * Selection Rules:
 * 1. Validates targetRole against CAREER_ROLES.
 * 2. Validates and canonicalizes all targetSkills.
 * 3. Identifies supported vs unsupported skills. If no supported skills have questions, throws informative error.
 * 4. Gathers candidate questions matching targetSkills and targetRole.
 * 5. Deterministically selects up to `count` questions evenly distributed across target skills.
 * 6. Formats selected questions into session question schema shape.
 *
 * @param {object} params
 * @param {string} params.targetRole Role ID or Role title
 * @param {string[]} params.targetSkills List of target skills
 * @param {string} [params.difficulty='intermediate'] Difficulty tier
 * @param {number} [params.count=5] Number of questions to select (1..10)
 * @param {string|number} [params.seed='deterministic-default'] Seed for reproducible selection
 * @returns {Array<object>} Selected questions ready for session attachment
 */
export function selectQuestionsForSession({
  targetRole,
  targetSkills,
  difficulty = 'intermediate',
  count = 5,
  seed = 'deterministic-default',
}) {
  if (typeof targetRole !== 'string' || targetRole.trim() === '') {
    throw new Error('targetRole is required for question selection.');
  }

  // Resolve role from ID or title
  const normalizedRoleInput = targetRole.trim().toLowerCase();
  const matchedRole = CAREER_ROLES.find(
    (r) => r.id === normalizedRoleInput || r.title.toLowerCase() === normalizedRoleInput,
  );

  if (!matchedRole) {
    throw new Error(`Role "${targetRole}" is not a recognized career role.`);
  }

  if (!Array.isArray(targetSkills) || targetSkills.length === 0) {
    throw new Error('targetSkills must be a non-empty array of skills.');
  }

  // Validate canonical skills
  const canonicalTargets = [];
  for (const rawSkill of targetSkills) {
    if (typeof rawSkill !== 'string' || rawSkill.trim() === '') {
      throw new Error('All targetSkills entries must be non-empty strings.');
    }
    const resolved = canonicalSkill(rawSkill.trim());
    if (!resolved) {
      throw new Error(`Target skill "${rawSkill}" is not a recognized canonical skill.`);
    }
    if (!canonicalTargets.some((t) => t.key === resolved.key)) {
      canonicalTargets.push(resolved);
    }
  }

  // Partition into supported vs unsupported skills
  const supportedTargets = [];
  const unsupportedTargets = [];
  for (const skill of canonicalTargets) {
    if (isSkillSupported(skill.name)) {
      supportedTargets.push(skill);
    } else {
      unsupportedTargets.push(skill);
    }
  }

  if (supportedTargets.length === 0) {
    const skillList = unsupportedTargets.map((s) => `"${s.name}"`).join(', ');
    throw new Error(
      `No curated interview questions are currently available for: ${skillList}.`,
    );
  }

  const requestedCount = Math.max(1, Math.min(10, Math.round(count)));
  const prng = createMulberry32Prng(
    typeof seed === 'number' ? seed : hashStringToSeed(String(seed)),
  );

  // Group available questions by skill key
  const questionsBySkill = new Map();
  for (const skill of supportedTargets) {
    // Primary candidates: match skill and role
    let candidates = INTERVIEW_QUESTION_BANK.filter(
      (q) => q.skillKey === skill.key && q.roles.includes(matchedRole.id),
    );

    // Fallback: if role-specific matches are empty, allow any question for that skill
    if (candidates.length === 0) {
      candidates = INTERVIEW_QUESTION_BANK.filter((q) => q.skillKey === skill.key);
    }

    // Stably sort candidates by ID
    candidates = [...candidates].sort((a, b) => a.id.localeCompare(b.id));

    // Optional difficulty preference: prioritize requested difficulty
    const prioritized = [
      ...candidates.filter((q) => q.difficulty === difficulty),
      ...candidates.filter((q) => q.difficulty !== difficulty),
    ];

    questionsBySkill.set(skill.key, prioritized);
  }

  // Deterministically round-robin pick from supported target skills
  const selectedQuestions = [];
  const selectedIds = new Set();
  const skillKeys = supportedTargets.map((s) => s.key).sort();

  let loopSafety = 0;
  while (selectedQuestions.length < requestedCount && loopSafety < 50) {
    loopSafety += 1;
    let addedInThisPass = false;

    for (const key of skillKeys) {
      if (selectedQuestions.length >= requestedCount) break;
      const candidates = questionsBySkill.get(key) || [];
      const nextUnchosen = candidates.find((q) => !selectedIds.has(q.id));
      if (nextUnchosen) {
        selectedQuestions.push(nextUnchosen);
        selectedIds.add(nextUnchosen.id);
        addedInThisPass = true;
      }
    }

    if (!addedInThisPass) {
      // All candidate questions for supported skills have been exhausted
      break;
    }
  }

  // Format into session questions schema shape
  return selectedQuestions.map((q, index) => ({
    questionId: q.id,
    order: index + 1,
    type: q.type,
    prompt: q.intent.prompt,
    targetSkill: q.targetSkill,
    difficulty: q.difficulty,
    rubricCriteria: [...q.evaluationCriteria.rubricCriteria],
  }));
}
