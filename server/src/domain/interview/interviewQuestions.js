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
export const QUESTION_BANK_VERSION = 2;

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

  // ==========================================
  // HTML
  // ==========================================
  {
    id: 'iq-html-001',
    version: 1,
    targetSkill: 'HTML',
    skillKey: 'html',
    roles: ['frontend-developer', 'full-stack-developer', 'ui-ux-designer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain semantic HTML tags, accessibility benefits, and SEO impact.',
      prompt:
        'Why is using semantic HTML5 elements (such as <header>, <nav>, <main>, <article>, and <aside>) superior to generic <div> tags, and how do semantic elements impact web accessibility and search engine ranking?',
      context:
        'Tests basic understanding of semantic markup, accessibility assistive tech, and SEO structure.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains accessibility advantages: screen readers can navigate document landmarks directly',
        'Explains SEO benefits: search crawlers infer page structure and content hierarchy accurately',
        'Contrasts specific semantic tags (<main>, <nav>, <article>, <section>) with generic <div> containers',
      ],
      expectedKeyConcepts: [
        'landmarks',
        'screen readers',
        'SEO crawlability',
        'document outline',
        'div soup',
      ],
      commonMisconceptions: [
        'Thinking semantic tags are only for CSS styling defaults',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate distinction between layout containers and semantic landmarks.',
        depth: 'Discusses accessibility trees and screen reader navigation modes.',
        clarity: 'Provides concrete examples of replacing div structures with semantic tags.',
        relevance: 'Focused on HTML semantics.',
      },
    },
  },
  {
    id: 'iq-html-002',
    version: 1,
    targetSkill: 'HTML',
    skillKey: 'html',
    roles: ['frontend-developer', 'full-stack-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Examine browser script loading: standard vs async vs defer execution.',
      prompt:
        'Compare standard <script>, <script async>, and <script defer> in HTML. How do they affect the browser parser, DOMContentLoaded, and script execution order?',
      context:
        'Evaluates browser rendering pipeline and script loading performance.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains parser-blocking behavior of standard inline/external scripts',
        'Explains async downloads in background and executes immediately when ready, out of order',
        'Explains defer downloads in background and executes in document order right before DOMContentLoaded',
      ],
      expectedKeyConcepts: [
        'parser blocking',
        'DOMContentLoaded',
        'execution order',
        'critical rendering path',
      ],
      commonMisconceptions: [
        'Assuming async scripts maintain mutual dependency order',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate mapping of script attributes to parsing and execution timing.',
        depth: 'Discusses DOMContentLoaded and rendering waterfall.',
        clarity: 'Clear comparison of all three modes.',
        relevance: 'Focused on HTML script loading.',
      },
    },
  },

  // ==========================================
  // CSS
  // ==========================================
  {
    id: 'iq-css-001',
    version: 1,
    targetSkill: 'CSS',
    skillKey: 'css',
    roles: ['frontend-developer', 'full-stack-developer', 'ui-ux-designer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain the CSS Box Model and box-sizing property differences.',
      prompt:
        'Describe the layers of the CSS Box Model (content, padding, border, margin), and explain why modern web developers almost universally set "box-sizing: border-box" in their global CSS reset.',
      context: 'Core CSS layout fundamentals and dimension calculation.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines the four layers in order: content, padding, border, and margin',
        'Explains content-box adds padding and border to declared width/height',
        'Explains border-box includes padding and border within the declared width/height, preventing layout overflow',
      ],
      expectedKeyConcepts: [
        'content-box vs border-box',
        'box model layers',
        'CSS reset',
        'dimension calculations',
      ],
      commonMisconceptions: [
        'Thinking margin is included inside the border-box calculation',
      ],
      scoringGuidelines: {
        accuracy: 'Precise formula of rendered width under content-box vs border-box.',
        depth: 'Explains impact on responsive grids and nested percentage widths.',
        clarity: 'Concise explanation with simple mathematical breakdown.',
        relevance: 'Directly addresses CSS box sizing.',
      },
    },
  },
  {
    id: 'iq-css-002',
    version: 1,
    targetSkill: 'CSS',
    skillKey: 'css',
    roles: ['frontend-developer', 'full-stack-developer', 'ui-ux-designer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Architect a responsive layout choosing between CSS Flexbox and CSS Grid.',
      prompt:
        'When building a modern responsive web application, what architectural principles guide your choice between CSS Flexbox and CSS Grid, and how do you handle responsive card layouts with auto-fit and minmax()?',
      context: 'Evaluates layout architecture decision-making and modern CSS mastery.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Distinguishes Flexbox as one-dimensional (content-first rows or columns) vs Grid as two-dimensional (layout-first rows and columns)',
        'Explains repeat(auto-fit, minmax(250px, 1fr)) for responsive wrapping without media queries',
        'Recommends Flexbox for components (navbars, button groups) and Grid for page-level or card layouts',
      ],
      expectedKeyConcepts: [
        '1D vs 2D layout',
        'auto-fit vs auto-fill',
        'minmax()',
        'content-driven vs layout-driven',
      ],
      commonMisconceptions: [
        'Believing Flexbox and Grid are mutually exclusive rivals rather than complementary',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate technical distinction between 1D and 2D layout models.',
        depth: 'Explains auto-fit vs auto-fill behavior when items are few.',
        clarity: 'Structured decision framework for layout choices.',
        relevance: 'Focused on CSS layout architecture.',
      },
    },
  },

  // ==========================================
  // Testing
  // ==========================================
  {
    id: 'iq-testing-001',
    version: 1,
    targetSkill: 'Testing',
    skillKey: 'testing',
    roles: ['qa-engineer', 'backend-developer', 'frontend-developer', 'full-stack-developer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain the testing pyramid: unit, integration, and end-to-end tests.',
      prompt:
        'Explain the Test Pyramid model. What are the key characteristics, execution speeds, and trade-offs of unit tests, integration tests, and end-to-end (E2E) tests?',
      context: 'Evaluates fundamental software testing strategy and quality mindset.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Differentiates unit tests (isolated, fast, high volume), integration tests (service boundaries, moderate speed), and E2E tests (real environments, slow, low volume)',
        'Explains the trade-offs: cost and maintenance burden increase as you move up the pyramid',
        'Discusses why an inverted "ice cream cone" test suite causes slow feedback and flakiness',
      ],
      expectedKeyConcepts: [
        'test pyramid',
        'isolation vs realism',
        'execution speed',
        'test maintenance cost',
        'test flakiness',
      ],
      commonMisconceptions: [
        'Thinking having only E2E tests is optimal because they test real user paths',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate categorization and cost/speed trade-offs across tiers.',
        depth: 'Explains boundary mocking in unit tests vs real databases in integration tests.',
        clarity: 'Clear structured comparison.',
        relevance: 'Focuses on testing strategy.',
      },
    },
  },
  {
    id: 'iq-testing-002',
    version: 1,
    targetSkill: 'Testing',
    skillKey: 'testing',
    roles: ['qa-engineer', 'full-stack-developer', 'backend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Design boundary value and equivalence partition test cases for financial calculations.',
      prompt:
        'Suppose you are testing an e-commerce checkout discount engine that applies percentage coupons, minimum purchase thresholds, and sales tax. What equivalence partitioning and boundary value test cases would you create to verify precision and business rules?',
      context: 'Tests black-box and white-box test design techniques on business-critical logic.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Applies boundary value analysis on thresholds (e.g. exactly at threshold, threshold - 0.01, threshold + 0.01)',
        'Tests edge cases: negative amounts, zero amount, 100% discount, discount greater than total',
        'Addresses floating-point arithmetic hazards (e.g. 0.1 + 0.2 precision issues in currency calculations)',
      ],
      expectedKeyConcepts: [
        'boundary value analysis',
        'equivalence partitioning',
        'floating point rounding',
        'zero/negative boundaries',
      ],
      commonMisconceptions: [
        'Only testing "happy path" round numbers like $100 with 10% coupon',
      ],
      scoringGuidelines: {
        accuracy: 'Thorough coverage of valid and invalid partitions.',
        depth: 'Identifies currency rounding and IEEE 754 float precision hazards.',
        clarity: 'Organized test matrix or table.',
        relevance: 'Directly solves the checkout scenario.',
      },
    },
  },

  // ==========================================
  // Test Automation
  // ==========================================
  {
    id: 'iq-testauto-001',
    version: 1,
    targetSkill: 'Test Automation',
    skillKey: 'testautomation',
    roles: ['qa-engineer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Architect resilient browser automation tests avoiding flakiness and tight coupling.',
      prompt:
        'What strategies and design patterns (such as the Page Object Model and explicit wait conditions) do you use in automated end-to-end tests to prevent test flakiness and maintainability bottlenecks?',
      context: 'Evaluates automated testing architectural maturity and anti-flakiness practices.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Describes Page Object Model (POM) to decouple UI element selectors from test assertions',
        'Advocates explicit smart waits (waiting for DOM states/network idle) over arbitrary sleep timers',
        'Recommends user-facing accessible locators (role, label, text) over fragile CSS/XPath selectors',
      ],
      expectedKeyConcepts: [
        'Page Object Model',
        'explicit vs implicit vs sleep waits',
        'test flakiness',
        'accessible locators',
      ],
      commonMisconceptions: [
        'Using hardcoded time sleeps (e.g. sleep(5000)) to fix asynchronous race conditions',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate articulation of POM structure and wait mechanisms.',
        depth: 'Compares locator stability (data-testid, ARIA roles vs auto-generated classes).',
        clarity: 'Structured explanation of maintainable automation suites.',
        relevance: 'Focuses on test automation engineering.',
      },
    },
  },
  {
    id: 'iq-testauto-002',
    version: 1,
    targetSkill: 'Test Automation',
    skillKey: 'testautomation',
    roles: ['qa-engineer', 'devops-engineer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Design a continuous automated testing pipeline with parallel execution and triage.',
      prompt:
        'How would you architect a CI/CD test automation pipeline for a microservices platform with 2,000 automated tests to achieve sub-10-minute feedback, handle quarantine of flaky tests, and generate actionable failure reports?',
      context: 'Tests enterprise test pipeline design, sharding, and quality governance.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Proposes test sharding and parallel container runners based on execution runtime history',
        'Defines test tiering: fast unit/smoke tests on PR, full regression on merge or nightly',
        'Establishes flaky test quarantine policy with automated re-runs and health tracking',
      ],
      expectedKeyConcepts: [
        'test sharding / parallelization',
        'test quarantine',
        'smoke vs regression gate',
        'test telemetry / artifacts',
      ],
      commonMisconceptions: [
        'Running the entire monolithic test suite sequentially on every commit',
      ],
      scoringGuidelines: {
        accuracy: 'Sound pipeline design balancing fast feedback with thorough validation.',
        depth: 'Details artifact collection (screenshots, traces, network logs) on failure.',
        clarity: 'Systematic pipeline stage breakdown.',
        relevance: 'Directly addresses large-scale test automation governance.',
      },
    },
  },

  // ==========================================
  // UI Design
  // ==========================================
  {
    id: 'iq-uidesign-001',
    version: 1,
    targetSkill: 'UI Design',
    skillKey: 'uidesign',
    roles: ['ui-ux-designer', 'frontend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Explain visual hierarchy, typography scales, and WCAG accessibility standards.',
      prompt:
        'How do you establish clear visual hierarchy in user interface design using typography scale, contrast, and spatial relationships, and how do you ensure the interface satisfies WCAG 2.1 AA contrast requirements?',
      context: 'Evaluates core UI design craft, aesthetic principles, and accessibility compliance.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains hierarchy levers: typographic scale, font weight, color saturation, and negative space',
        'Cites WCAG 2.1 AA minimum contrast ratios (4.5:1 for normal text, 3:1 for large text and UI components)',
        'Explains non-color indicators for critical states (icons, underlines, text alongside color cues)',
      ],
      expectedKeyConcepts: [
        'visual hierarchy',
        'WCAG 2.1 AA',
        'contrast ratio (4.5:1)',
        'typographic scale',
        'color independence',
      ],
      commonMisconceptions: [
        'Relying solely on color to convey errors, success, or status',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate recall of accessibility contrast ratios and hierarchy principles.',
        depth: 'Explains touch targets (min 44x44px) and focus indicator visibility.',
        clarity: 'Structured explanation combining aesthetics with accessibility.',
        relevance: 'Focused on UI design fundamentals.',
      },
    },
  },
  {
    id: 'iq-uidesign-002',
    version: 1,
    targetSkill: 'UI Design',
    skillKey: 'uidesign',
    roles: ['ui-ux-designer', 'frontend-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Architect a cross-platform design token system for a multi-brand product suite.',
      prompt:
        'How would you structure a scalable design token architecture (global, alias/semantic, and component tokens) supporting light/dark themes and multiple product brands, and how do you ensure seamless handoff to frontend engineers?',
      context: 'Evaluates scalable design systems, token hierarchy, and engineering collaboration.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines token tiers: Global (raw values), Semantic/Alias (purpose-driven e.g. surface-primary), and Component tokens',
        'Explains theme switching mechanics (light/dark) via semantic token value re-mapping',
        'Describes automated export pipelines (e.g. Style Dictionary) translating tokens to CSS variables/JSON',
      ],
      expectedKeyConcepts: [
        'design tokens',
        'token tiers (global, semantic, component)',
        'theme mapping',
        'Style Dictionary',
        'design handoff',
      ],
      commonMisconceptions: [
        'Hardcoding hex colors directly into component styles rather than semantic tokens',
      ],
      scoringGuidelines: {
        accuracy: 'Precise three-tier token hierarchy definition.',
        depth: 'Discusses governance, deprecation workflows, and CSS variable mapping.',
        clarity: 'Clear architectural explanation from Figma to code.',
        relevance: 'Addresses enterprise design system challenges.',
      },
    },
  },

  // ==========================================
  // UX Research
  // ==========================================
  {
    id: 'iq-uxres-001',
    version: 1,
    targetSkill: 'UX Research',
    skillKey: 'uxresearch',
    roles: ['ui-ux-designer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Formulate a mixed-methods UX research plan for a drop-off problem.',
      prompt:
        'Suppose analytics show a 45% drop-off at step 2 of a financial registration flow. How would you design a mixed-methods research study (quantitative analytics + qualitative usability testing) to identify the root cause and validate improvements?',
      context: 'Tests research methodology, bias mitigation, and data synthesis.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Combines quantitative data (funnel drop-off, heatmaps, session recordings) with qualitative user testing',
        'Designs open-ended, non-leading task scenarios for moderated or unmoderated user sessions',
        'Synthesizes findings into thematic user friction points and prioritized design hypotheses',
      ],
      expectedKeyConcepts: [
        'mixed-methods research',
        'non-leading questions',
        'usability testing protocol',
        'funnel analytics',
        'thematic synthesis',
      ],
      commonMisconceptions: [
        'Asking users "Would you use this?" or leading them to the expected path during usability tests',
      ],
      scoringGuidelines: {
        accuracy: 'Appropriate pairing of quantitative signals with qualitative inquiry.',
        depth: 'Identifies cognitive load, privacy hesitation, or usability blockers in step 2.',
        clarity: 'Step-by-step research roadmap from discovery to validation.',
        relevance: 'Directly addresses the registration drop-off scenario.',
      },
    },
  },

  // ==========================================
  // Figma
  // ==========================================
  {
    id: 'iq-figma-001',
    version: 1,
    targetSkill: 'Figma',
    skillKey: 'figma',
    roles: ['ui-ux-designer', 'frontend-developer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain Figma Auto Layout and how it maps to CSS Flexbox.',
      prompt:
        'How does Auto Layout in Figma work, what are direction, gap, padding, and alignment properties, and how does Auto Layout mirror CSS Flexbox during developer handoff?',
      context: 'Evaluates Figma technical fluency and developer handoff alignment.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Maps Auto Layout properties directly to Flexbox: direction (flex-direction), gap (gap), padding (padding), align/distribute (align-items, justify-content)',
        'Explains resizing modes: Fixed, Hug Contents, and Fill Container',
        'Highlights how responsive components built with Auto Layout reduce design-engineering translation bugs',
      ],
      expectedKeyConcepts: [
        'Auto Layout',
        'Hug vs Fill vs Fixed',
        'CSS Flexbox mapping',
        'developer handoff',
      ],
      commonMisconceptions: [
        'Using manual grouping and absolute positioning instead of Auto Layout for dynamic components',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate mapping of Figma Auto Layout concepts to CSS Flexbox.',
        depth: 'Explains nested Auto Layouts for complex cards or navigation bars.',
        clarity: 'Intuitive analogies for resizing behavior.',
        relevance: 'Focused on modern Figma component construction.',
      },
    },
  },

  // ==========================================
  // Cloud Computing
  // ==========================================
  {
    id: 'iq-cloud-001',
    version: 1,
    targetSkill: 'Cloud Computing',
    skillKey: 'cloudcomputing',
    roles: ['cloud-engineer', 'backend-developer', 'devops-engineer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Compare IaaS, PaaS, and Serverless service models and trade-offs.',
      prompt:
        'Compare Infrastructure as a Service (IaaS), Platform as a Service (PaaS), and Serverless (FaaS). What are the trade-offs regarding operational overhead, control, cold start latency, and cost predictability?',
      context: 'Core cloud architecture classification and selection criteria.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines the shared responsibility boundary across IaaS (VMs), PaaS (containers/managed runtime), and FaaS (ephemeral functions)',
        'Identifies Serverless trade-offs: zero idle cost and auto-scaling vs cold starts, execution time limits, and vendor lock-in',
        'Provides selection criteria based on traffic patterns, compliance needs, and team operational capacity',
      ],
      expectedKeyConcepts: [
        'IaaS vs PaaS vs FaaS',
        'shared responsibility model',
        'cold start latency',
        'operational overhead',
      ],
      commonMisconceptions: [
        'Believing serverless has no servers or is always cheaper than reserved instances',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate division of responsibilities across cloud tiers.',
        depth: 'Discusses statefulness and concurrency constraints in serverless.',
        clarity: 'Clear comparative summary.',
        relevance: 'Focuses on cloud architecture models.',
      },
    },
  },
  {
    id: 'iq-cloud-002',
    version: 1,
    targetSkill: 'Cloud Computing',
    skillKey: 'cloudcomputing',
    roles: ['cloud-engineer', 'devops-engineer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Architect a disaster recovery strategy meeting strict RTO and RPO targets.',
      prompt:
        'A mission-critical financial application requires a disaster recovery strategy with a Recovery Time Objective (RTO) under 15 minutes and Recovery Point Objective (RPO) under 1 minute. How would you architect this across cloud regions?',
      context: 'Tests enterprise high availability, cross-region replication, and disaster recovery.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines RTO (acceptable downtime duration) and RPO (acceptable data loss window)',
        'Proposes active-passive (pilot light/warm standby) or active-active multi-region deployment',
        'Explains data replication mechanism: continuous asynchronous or synchronous replication meeting < 1 min RPO',
        'Describes automated DNS / Anycast global routing failover (e.g. Route 53 health check routing)',
      ],
      expectedKeyConcepts: [
        'RTO vs RPO',
        'multi-region active-passive vs active-active',
        'cross-region replication lag',
        'global traffic routing',
      ],
      commonMisconceptions: [
        'Confusing RTO with RPO',
        'Assuming synchronous replication across global distances has zero latency cost',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate architectural decisions satisfying the 15m RTO / 1m RPO constraints.',
        depth: 'Discusses split-brain prevention and database write-leader promotion.',
        clarity: 'Structured failover sequence.',
        relevance: 'Directly addresses disaster recovery engineering.',
      },
    },
  },

  // ==========================================
  // Networking
  // ==========================================
  {
    id: 'iq-net-001',
    version: 1,
    targetSkill: 'Networking',
    skillKey: 'networking',
    roles: ['cloud-engineer', 'devops-engineer', 'backend-developer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Walk through DNS resolution and the networking journey of an HTTP request.',
      prompt:
        'Walk through the network path that occurs when a client browser queries https://api.example.com/users: from recursive DNS resolution to TCP three-way handshake and TLS negotiation.',
      context: 'Fundamental networking evaluation essential for backend, DevOps, and cloud engineers.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Traces DNS hierarchy: browser cache -> OS cache -> recursive resolver -> root -> TLD -> authoritative nameserver',
        'Explains TCP three-way handshake (SYN, SYN-ACK, ACK)',
        'Explains TLS handshake establishing encrypted session keys before HTTP application data flows',
      ],
      expectedKeyConcepts: [
        'recursive DNS resolution',
        'TCP 3-way handshake (SYN, SYN-ACK, ACK)',
        'TLS handshake',
        'authoritative nameserver',
      ],
      commonMisconceptions: [
        'Thinking DNS query uses TCP by default (standard DNS queries use UDP port 53)',
      ],
      scoringGuidelines: {
        accuracy: 'Correct chronological order of networking protocols.',
        depth: 'Mentions DNS record types (A, AAAA, CNAME) and TTL caching.',
        clarity: 'Clear step-by-step narrative.',
        relevance: 'Core web networking trajectory.',
      },
    },
  },
  {
    id: 'iq-net-002',
    version: 1,
    targetSkill: 'Networking',
    skillKey: 'networking',
    roles: ['cloud-engineer', 'devops-engineer', 'backend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Explain Layer 4 vs Layer 7 load balancing and reverse proxy architecture.',
      prompt:
        'Compare Layer 4 (Transport) and Layer 7 (Application) load balancers. How does each operate, what information do they inspect, and what are the performance vs routing flexibility trade-offs?',
      context: 'Evaluates network load balancing, reverse proxies, and traffic distribution.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains Layer 4 operates on IP address and TCP/UDP ports without inspecting packet payload',
        'Explains Layer 7 terminates TCP and inspects HTTP headers, cookies, URL paths, and query parameters',
        'Compares trade-offs: Layer 4 has higher throughput and lower CPU overhead; Layer 7 enables path-based routing, SSL termination, and sticky sessions',
      ],
      expectedKeyConcepts: [
        'OSI Layer 4 vs Layer 7',
        'SSL termination',
        'path-based routing',
        'TCP termination',
        'throughput vs inspection',
      ],
      commonMisconceptions: [
        'Believing Layer 4 load balancers can inspect HTTP Authorization headers or cookies',
      ],
      scoringGuidelines: {
        accuracy: 'Clear technical boundary between transport and application layer routing.',
        depth: 'Discusses connection pooling, TLS offloading, and WebSocket proxying.',
        clarity: 'Structured feature comparison.',
        relevance: 'Focused on modern load balancing architectures.',
      },
    },
  },

  // ==========================================
  // CI/CD
  // ==========================================
  {
    id: 'iq-cicd-001',
    version: 1,
    targetSkill: 'CI/CD',
    skillKey: 'cicd',
    roles: ['devops-engineer', 'cloud-engineer', 'backend-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Compare Blue-Green and Canary deployment strategies and rollback triggers.',
      prompt:
        'Compare Blue-Green deployments with Canary deployments. When would you choose one over the other, and what automated monitoring signals (error rates, latency thresholds) should trigger an automatic rollback?',
      context: 'Evaluates zero-downtime deployment strategies, telemetry, and automated safety.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines Blue-Green: two identical environments with instantaneous router/traffic cutover and instant rollback',
        'Defines Canary: gradual incremental routing (e.g. 5% -> 25% -> 100%) to a small subset of real users',
        'Identifies rollback signals: spike in HTTP 5xx errors, p99 latency degradation, unhandled exceptions in logs',
        'Addresses database schema backward compatibility during progressive rollouts',
      ],
      expectedKeyConcepts: [
        'Blue-Green vs Canary',
        'gradual traffic shifting',
        'automated rollback criteria',
        'backward-compatible database migrations',
      ],
      commonMisconceptions: [
        'Forgetting that rollback requires database schemas to support both old and new application versions simultaneously',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate distinction between full cutover vs progressive percentage deployment.',
        depth: 'Discusses database expand-and-contract migration patterns.',
        clarity: 'Structured decision criteria.',
        relevance: 'Addresses production deployment reliability.',
      },
    },
  },

  // ==========================================
  // Mobile Development
  // ==========================================
  {
    id: 'iq-mobile-001',
    version: 1,
    targetSkill: 'Mobile Development',
    skillKey: 'mobiledevelopment',
    roles: ['mobile-developer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 200,
    intent: {
      summary: 'Design an offline-first mobile architecture with data synchronization and conflict resolution.',
      prompt:
        'How would you architect an offline-first mobile application where users can create and edit records without internet access, and what strategy would you use to resolve conflicts when the device re-establishes connectivity?',
      context: 'Evaluates mobile local persistence, network state handling, and sync conflict resolution.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Proposes local persistent storage (e.g. SQLite, Room, Core Data, WatermelonDB) as single source of truth for the UI',
        'Implements an outbound mutation queue that replays operations upon network reconnection',
        'Explains conflict resolution strategies: Last-Write-Wins (with vector clocks/timestamps), server-wins, or CRDTs',
      ],
      expectedKeyConcepts: [
        'offline-first',
        'local persistence as single source of truth',
        'mutation queue',
        'conflict resolution (LWW, CRDTs)',
      ],
      commonMisconceptions: [
        'Blocking the user interface with loading spinners whenever network connectivity is lost',
      ],
      scoringGuidelines: {
        accuracy: 'Sound offline-first pattern with local database and queued background sync.',
        depth: 'Discusses optimistic UI updates and network reachability listeners.',
        clarity: 'Structured end-to-end sync workflow.',
        relevance: 'Specifically tailored to mobile platform constraints.',
      },
    },
  },
  {
    id: 'iq-mobile-002',
    version: 1,
    targetSkill: 'Mobile Development',
    skillKey: 'mobiledevelopment',
    roles: ['mobile-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Diagnose and remediate memory leaks, retain cycles, and UI thread jank in mobile applications.',
      prompt:
        'When profiling a mobile application experiencing frame drops (jank) and out-of-memory crashes during prolonged sessions, what diagnostic tools and memory profiling techniques would you employ to identify retain cycles, heavy view hierarchies, or uncollected native resources?',
      context: 'Tests deep mobile performance profiling, memory lifecycle, and rendering pipeline optimization.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Identifies profiling tools (e.g. Android Profiler, Memory LeakCanary, Xcode Instruments, Allocations/Leaks instrument)',
        'Explains retain cycles or memory leaks caused by circular strong references, closures/callbacks holding activity/controller contexts, or un-removed event listeners',
        'Analyzes rendering jank: exceeding 16ms frame budget (60 FPS) due to heavy main thread computation, complex layout passes, or overdraw',
      ],
      expectedKeyConcepts: [
        'retain cycles / strong reference cycles',
        '16ms frame budget / 60 FPS',
        'overdraw and layout hierarchy flattening',
        'Memory LeakCanary / Xcode Instruments',
      ],
      commonMisconceptions: [
        'Believing garbage-collected runtimes cannot suffer from memory leaks',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate explanation of reference counting / garbage collection leak mechanics on mobile.',
        depth: 'Mentions main thread UI rendering budget and GPU overdraw inspection.',
        clarity: 'Presents a structured profiling and remediation strategy.',
        relevance: 'Focused directly on mobile app performance and stability.',
      },
    },
  },

  // ==========================================
  // Data Visualisation
  // ==========================================
  {
    id: 'iq-datavis-001',
    version: 1,
    targetSkill: 'Data Visualisation',
    skillKey: 'datavisualisation',
    roles: ['data-analyst', 'data-scientist'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Select appropriate chart types and avoid misleading visual encodings.',
      prompt:
        'How do you choose between a bar chart, line chart, scatter plot, and histogram based on variable types (categorical vs continuous), and what are common misleading practices (such as truncated axes) that distort data?',
      context: 'Evaluates data communication integrity, chart selection heuristics, and visual perception.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Maps variable types correctly: bar chart for categorical comparisons, line chart for continuous time-series, scatter plot for bivariate correlation, histogram for distributions',
        'Explains the deception of truncating the y-axis on bar charts (exaggerating small differences)',
        'Highlights cognitive visual variables: color saturation, position along a common scale, and aspect ratio',
      ],
      expectedKeyConcepts: [
        'categorical vs continuous data',
        'truncated y-axis deception',
        'time-series vs distribution',
        'visual encoding channels',
      ],
      commonMisconceptions: [
        'Using 3D charts or pie charts with more than 5 slices for critical decision-making',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate chart mapping to statistical data types.',
        depth: 'Explains perceptual accuracy of human eye (position > length > area > angle).',
        clarity: 'Clear distinction between exploratory and explanatory visuals.',
        relevance: 'Focused on data visualization best practices.',
      },
    },
  },

  // ==========================================
  // Excel
  // ==========================================
  {
    id: 'iq-excel-001',
    version: 1,
    targetSkill: 'Excel',
    skillKey: 'excel',
    roles: ['data-analyst'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain XLOOKUP vs VLOOKUP advantages, Index-Match, and data hygiene.',
      prompt:
        'Why is XLOOKUP (or INDEX/MATCH) superior to traditional VLOOKUP in Excel, and how do Pivot Tables facilitate rapid aggregation and multi-dimensional analysis?',
      context: 'Evaluates practical spreadsheet data analysis proficiency.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains VLOOKUP limitations: requires lookup column to be leftmost, fragile if columns inserted, defaults to approximate match',
        'Highlights XLOOKUP advantages: looks in any direction, defaults to exact match, handles missing values natively',
        'Describes Pivot Tables: dynamic grouping, multi-level summarization, calculated fields, and filtering',
      ],
      expectedKeyConcepts: [
        'XLOOKUP vs VLOOKUP',
        'exact vs approximate match',
        'leftward lookup',
        'Pivot Table aggregation',
      ],
      commonMisconceptions: [
        'Assuming VLOOKUP is robust when columns are dynamically inserted or reordered',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate comparison of lookup formulas and syntax safety.',
        depth: 'Mentions computational performance on large sheets.',
        clarity: 'Clear real-world business data lookup example.',
        relevance: 'Directly addresses Excel data analysis.',
      },
    },
  },

  // ==========================================
  // Machine Learning
  // ==========================================
  {
    id: 'iq-ml-001',
    version: 1,
    targetSkill: 'Machine Learning',
    skillKey: 'machinelearning',
    roles: ['data-scientist'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Explain the bias-variance trade-off and regularization techniques.',
      prompt:
        'Explain the bias-variance trade-off in machine learning. How do high bias (underfitting) and high variance (overfitting) manifest on training vs validation loss curves, and how do L1/L2 regularization help?',
      context: 'Fundamental machine learning model evaluation and generalization principles.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines bias (error from erroneous assumptions/oversimplification) and variance (sensitivity to small fluctuations in training set)',
        'Describes loss curves: underfitting shows high training and validation error; overfitting shows low training error but diverging validation error',
        'Explains regularization: L1 (Lasso) promotes sparsity/feature selection; L2 (Ridge) penalizes large weight magnitudes',
      ],
      expectedKeyConcepts: [
        'bias-variance trade-off',
        'underfitting vs overfitting',
        'loss curve divergence',
        'L1 (Lasso) vs L2 (Ridge) regularization',
      ],
      commonMisconceptions: [
        'Believing lower training loss always indicates a superior production model',
      ],
      scoringGuidelines: {
        accuracy: 'Mathematically sound definition of bias, variance, and irreducible error.',
        depth: 'Explains k-fold cross-validation as an empirical guardrail.',
        clarity: 'Structured explanation referencing learning curves.',
        relevance: 'Core machine learning theory.',
      },
    },
  },
  {
    id: 'iq-ml-002',
    version: 1,
    targetSkill: 'Machine Learning',
    skillKey: 'machinelearning',
    roles: ['data-scientist'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.SCENARIO,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Handle severe class imbalance and select proper evaluation metrics in fraud detection.',
      prompt:
        'You are training a model to detect credit card fraud where only 0.1% of transactions are fraudulent. Why is accuracy a misleading metric, and what techniques (sampling, loss weighting, PR-AUC vs ROC-AUC) would you use?',
      context: 'Evaluates real-world machine learning engineering on imbalanced datasets.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Explains the accuracy paradox: a naive model predicting all negatives achieves 99.9% accuracy but catches zero fraud',
        'Recommends Precision, Recall, F1-score, and Precision-Recall AUC over ROC-AUC for severe imbalance',
        'Proposes mitigation techniques: class weighting in loss function, focal loss, or resampling (SMOTE, undersampling)',
      ],
      expectedKeyConcepts: [
        'accuracy paradox',
        'Precision-Recall AUC vs ROC-AUC',
        'cost-sensitive learning / class weights',
        'SMOTE / undersampling',
      ],
      commonMisconceptions: [
        'Relying on ROC-AUC when true negative rate dominates the calculation',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate demonstration of why ROC-AUC can present an overly optimistic picture on imbalanced data.',
        depth: 'Discusses business cost matrix (cost of false positive vs false negative).',
        clarity: 'Structured modeling and evaluation roadmap.',
        relevance: 'Directly addresses the fraud detection scenario.',
      },
    },
  },

  // ==========================================
  // Statistics
  // ==========================================
  {
    id: 'iq-stats-001',
    version: 1,
    targetSkill: 'Statistics',
    skillKey: 'statistics',
    roles: ['data-scientist', 'data-analyst'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain hypothesis testing, p-values, and Type I vs Type II errors in A/B testing.',
      prompt:
        'In the context of product A/B testing, what is a p-value, what do Type I (false positive) and Type II (false negative) errors represent, and why is sample size determination essential prior to launching a test?',
      context: 'Core statistical inference and experimentation integrity.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines p-value: the probability of observing results at least as extreme as the observed data, assuming the null hypothesis is true',
        'Differentiates Type I error (alpha, rejecting true null) vs Type II error (beta, failing to reject false null)',
        'Explains power analysis: determining minimum detectable effect and sample size to avoid underpowered experiments and premature peaking',
      ],
      expectedKeyConcepts: [
        'null hypothesis',
        'p-value definition',
        'Type I vs Type II error',
        'statistical power (1 - beta)',
        'peeking problem',
      ],
      commonMisconceptions: [
        'Believing p-value is the probability that the null hypothesis is true',
      ],
      scoringGuidelines: {
        accuracy: 'Rigorous statistical definition of p-values without the common inversion fallacy.',
        depth: 'Mentions statistical power and minimum detectable effect.',
        clarity: 'Clear explanation using practical A/B conversion examples.',
        relevance: 'Focused on applied statistical testing.',
      },
    },
  },

  // ==========================================
  // TypeScript
  // ==========================================
  {
    id: 'iq-ts-001',
    version: 1,
    targetSkill: 'TypeScript',
    skillKey: 'typescript',
    roles: ['frontend-developer', 'backend-developer', 'full-stack-developer'],
    difficulty: 'beginner',
    type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    timeLimitSeconds: 150,
    intent: {
      summary: 'Explain structural typing, interfaces vs type aliases, and compile-time guarantees.',
      prompt:
        'What is structural typing (duck typing) in TypeScript, and what are the practical differences between an interface and a type alias when modeling application domain types?',
      context: 'Evaluates TypeScript static typing fundamentals and domain modeling.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Defines structural typing: compatibility is determined by shape/properties rather than explicit nominal declaration',
        'Compares interface vs type alias: interfaces support declaration merging and extends; type aliases support unions, primitives, and tuples',
        'Emphasizes that TypeScript types are fully erased at compile time and incur zero runtime overhead',
      ],
      expectedKeyConcepts: [
        'structural vs nominal typing',
        'type erasure',
        'declaration merging',
        'union types vs interface extension',
      ],
      commonMisconceptions: [
        'Expecting TypeScript type checks to validate untrusted runtime JSON payloads at execution time',
      ],
      scoringGuidelines: {
        accuracy: 'Accurate distinction between compile-time static analysis and runtime JavaScript.',
        depth: 'Explains declaration merging in library definitions vs union type flexibility.',
        clarity: 'Clear code-level examples.',
        relevance: 'Focused on core TypeScript concepts.',
      },
    },
  },

  // ==========================================
  // Behavioral Archetypes
  // ==========================================
  {
    id: 'iq-behav-001',
    version: 1,
    targetSkill: 'JavaScript',
    skillKey: 'javascript',
    roles: ['backend-developer', 'frontend-developer', 'full-stack-developer', 'devops-engineer'],
    difficulty: 'intermediate',
    type: INTERVIEW_QUESTION_TYPES.BEHAVIORAL,
    timeLimitSeconds: 180,
    intent: {
      summary: 'Demonstrate constructive technical disagreement and consensus building.',
      prompt:
        'Tell me about a time you strongly disagreed with a team member or technical lead regarding an architectural decision, library selection, or code review feedback. How did you present your case, resolve the disagreement, and ensure team alignment?',
      context: 'Assesses communication clarity, collaborative empathy, and data-driven decision making.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Applies structured communication (e.g. STAR method: Situation, Task, Action, Result)',
        'Uses objective evidence: prototypes, benchmarks, documentation, or user impact over personal ego',
        'Demonstrates professional disagree-and-commit maturity once a final decision was reached',
      ],
      expectedKeyConcepts: [
        'data-driven persuasion',
        'disagree and commit',
        'blameless communication',
        'STAR method',
      ],
      commonMisconceptions: [
        'Portraying conflict as a contest to be won rather than a collaborative search for the best outcome',
      ],
      scoringGuidelines: {
        accuracy: 'Demonstrates professional emotional intelligence and constructive collaboration.',
        depth: 'Explains long-term team impact and retrospective learnings.',
        clarity: 'Well-structured narrative with clear beginning, climax, and resolution.',
        relevance: 'Directly addresses technical disagreement in software teams.',
      },
    },
  },
  {
    id: 'iq-behav-002',
    version: 1,
    targetSkill: 'Linux',
    skillKey: 'linux',
    roles: ['devops-engineer', 'cloud-engineer', 'backend-developer', 'full-stack-developer'],
    difficulty: 'advanced',
    type: INTERVIEW_QUESTION_TYPES.BEHAVIORAL,
    timeLimitSeconds: 240,
    intent: {
      summary: 'Demonstrate leadership, incident response, and blameless post-mortem under pressure.',
      prompt:
        'Describe a situation where a major production outage, data integrity issue, or security alert occurred under your watch. How did you triage the immediate crisis, communicate with stakeholders under pressure, and lead the subsequent blameless post-mortem?',
      context: 'Evaluates operational resilience, incident management, and continuous learning culture.',
    },
    evaluationCriteria: {
      rubricCriteria: [
        'Describes clear incident triage: stop the bleeding (rollback/mitigate) before conducting root cause forensics',
        'Maintains proactive, transparent stakeholder communication channels with regular status cadences',
        'Leads a blameless post-mortem identifying systemic process and guardrail improvements rather than individual blame',
      ],
      expectedKeyConcepts: [
        'incident command',
        'mitigation first vs root cause forensics',
        'blameless post-mortem',
        'systemic remediation',
      ],
      commonMisconceptions: [
        'Attempting to debug root cause for hours while the production outage is still actively impacting users',
      ],
      scoringGuidelines: {
        accuracy: 'Reflects industry-standard incident command and SRE post-mortem principles.',
        depth: 'Describes actionable preventive measures implemented after the incident.',
        clarity: 'Structured crisis narrative with calm, methodical progression.',
        relevance: 'Directly addresses production incident management.',
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
 * @param {string} [options.type]
 * @returns {Array<object>}
 */
export function getQuestionsForSkill(skillName, options = {}) {
  const canonical = canonicalSkill(skillName);
  if (!canonical) {
    throw new Error(`Skill "${skillName}" is not a recognized canonical skill.`);
  }

  const { difficulty, roleId, type } = options;

  return INTERVIEW_QUESTION_BANK.filter((q) => {
    if (q.skillKey !== canonical.key) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (roleId && !q.roles.includes(roleId)) return false;
    if (type && q.type !== type) return false;
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
 * @param {string} [options.type]
 * @returns {Array<object>}
 */
export function getQuestionsForRole(roleId, options = {}) {
  const role = findRole(roleId);
  if (!role) {
    throw new Error(`Role "${roleId}" is not a recognized career role in the catalogue.`);
  }

  const { difficulty, skillName, type } = options;
  const canonical = skillName ? canonicalSkill(skillName) : null;

  return INTERVIEW_QUESTION_BANK.filter((q) => {
    if (!q.roles.includes(roleId)) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (canonical && q.skillKey !== canonical.key) return false;
    if (type && q.type !== type) return false;
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
    id: q.id,
    questionId: q.id,
    order: index + 1,
    type: q.type,
    prompt: q.intent.prompt,
    targetSkill: q.targetSkill,
    difficulty: q.difficulty,
    timeLimitSeconds: q.timeLimitSeconds ?? 180,
    rubricCriteria: [...q.evaluationCriteria.rubricCriteria],
  }));
}
