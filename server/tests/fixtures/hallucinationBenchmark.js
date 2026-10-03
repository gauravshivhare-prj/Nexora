/**
 * Task 22 — Anti-Hallucination & Feedback Quality Benchmark Dataset.
 *
 * 16 expert-curated benchmark fixtures pairing candidate answers with
 * known stated facts and simulated AI hallucinated outputs.
 *
 * Used to measure and enforce:
 * 1. Skill grounding boundaries (preventing AI from attributing unmentioned skills).
 * 2. Conceptual hallucination detection (flagging claims not present in the answer).
 * 3. Model drift canary evaluation baselines.
 */

export const HALLUCINATION_BENCHMARK_FIXTURES = Object.freeze([
  // ─── 1. SQL vs Redis ──────────────────────────────────────────────────────
  {
    id: 'halluc-01-sql-redis',
    skill: 'sql',
    question: {
      id: 'sql-joins-1',
      prompt: 'Explain the difference between INNER JOIN and LEFT OUTER JOIN in SQL.',
      targetSkill: 'sql',
    },
    answerText:
      'An INNER JOIN produces rows that satisfy the matching condition in both tables. A LEFT OUTER JOIN returns every row from the left table, along with matching rows from the right table, filling unmatched right columns with NULL.',
    knownFacts: [
      'INNER JOIN produces intersecting rows matching in both tables',
      'LEFT JOIN includes all left-table rows with NULLs for unmatched right columns',
    ],
    hallucinatedClaims: ['Redis caching pipelines', 'In-memory key-value eviction'],
    hallucinatedSkills: ['Redis'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.9, relevance: 0.9 },
      feedback: 'Great job explaining joins and demonstrating proficiency in Redis cache warming strategies.',
      strengths: ['Clear join explanation', 'Redis pipeline optimization'],
      growthAreas: ['Consider Redis cluster sharding'],
      groundedSkills: ['SQL', 'Redis'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.85, clarity: 0.9, relevance: 1.0 },
      feedback: 'Clear, accurate distinction between inner and left outer joins with appropriate null handling.',
      strengths: ['Precise inner join intersection', 'Correct NULL handling on left joins'],
      growthAreas: ['Consider mentioning Cartesian products or performance indexes'],
      groundedSkills: ['SQL'],
    },
  },

  // ─── 2. Node.js vs Kubernetes ─────────────────────────────────────────────
  {
    id: 'halluc-02-node-k8s',
    skill: 'nodejs',
    question: {
      id: 'node-loop-1',
      prompt: 'Describe the primary phases of the Node.js event loop.',
      targetSkill: 'nodejs',
    },
    answerText:
      'The Node.js event loop has timers (setTimeout), pending callbacks, poll (retrieving I/O events), check (setImmediate), and close callbacks. Microtasks run between phases.',
    knownFacts: [
      'Timers phase executes setTimeout callbacks',
      'Poll phase retrieves I/O events',
      'Check phase executes setImmediate',
      'Microtasks drain between phases',
    ],
    hallucinatedClaims: ['Kubernetes pod scheduling', 'Cluster autoscaling'],
    hallucinatedSkills: ['Kubernetes'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Demonstrated solid understanding of the loop and Kubernetes pod lifecycle management.',
      strengths: ['Loop phases', 'K8s deployment'],
      growthAreas: ['Pod autoscaling'],
      groundedSkills: ['Node.js', 'Kubernetes'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 1.0 },
      feedback: 'Accurately outlines primary event loop phases and microtask queue draining order.',
      strengths: ['Enumerated key phases', 'Noted microtask behavior'],
      growthAreas: ['Could elaborate on libuv thread pool operations'],
      groundedSkills: ['Node.js'],
    },
  },

  // ─── 3. Docker vs AWS ECS ─────────────────────────────────────────────────
  {
    id: 'halluc-03-docker-ecs',
    skill: 'docker',
    question: {
      id: 'docker-cache-1',
      prompt: 'How do you optimize Docker image builds using layer caching?',
      targetSkill: 'docker',
    },
    answerText:
      'Order instructions from least to most frequent changes. Copy package.json first, run npm install, then copy source code. Combine RUN commands and use multi-stage builds to reduce image size.',
    knownFacts: [
      'Order commands from least to most frequently modified',
      'Copy dependency manifests before full source code',
      'Use multi-stage builds to minimize image footprint',
    ],
    hallucinatedClaims: ['AWS ECS task definitions', 'Fargate container provisioning'],
    hallucinatedSkills: ['AWS'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Superb explanation of Dockerfile layers and configuring AWS ECS task definitions.',
      strengths: ['Layer caching', 'AWS ECS configuration'],
      growthAreas: ['Fargate spot instances'],
      groundedSkills: ['Docker', 'AWS'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Well-structured explanation of layer caching, dependency ordering, and multi-stage builds.',
      strengths: ['Dependency manifest separation', 'Multi-stage builds recommendation'],
      growthAreas: ['Consider mentioning .dockerignore file exclusions'],
      groundedSkills: ['Docker'],
    },
  },

  // ─── 4. React vs Redux Saga ───────────────────────────────────────────────
  {
    id: 'halluc-04-react-saga',
    skill: 'react',
    question: {
      id: 'react-effect-1',
      prompt: 'How does the useEffect dependency array work in React?',
      targetSkill: 'react',
    },
    answerText:
      'The dependency array tells React when to re-run the effect. Empty array runs once on mount. Omitting it runs on every render. Passing variables re-runs the effect only when those values change using Object.is comparison.',
    knownFacts: [
      'Empty array runs effect on mount',
      'Omitted array runs on every render',
      'Variables re-run effect when values change via Object.is comparison',
    ],
    hallucinatedClaims: ['Redux Saga side-effect orchestration', 'Saga takeLatest patterns'],
    hallucinatedSkills: ['Redux'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Clearly articulated React effects along with complex Redux Saga takeLatest generators.',
      strengths: ['Effect dependencies', 'Saga side-effects'],
      growthAreas: ['Saga cancellation'],
      groundedSkills: ['React', 'Redux'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.85, clarity: 0.95, relevance: 1.0 },
      feedback: 'Accurate summary of dependency array behavior, mount semantics, and value comparison rules.',
      strengths: ['Clear mount vs update comparison', 'Mentioned Object.is semantics'],
      growthAreas: ['Remember to mention cleanup functions for unmounting/subscription tear-down'],
      groundedSkills: ['React'],
    },
  },

  // ─── 5. Python GIL vs False Concurrency Affirmation ───────────────────────
  {
    id: 'halluc-05-python-gil',
    skill: 'python',
    question: {
      id: 'py-gil-1',
      prompt: 'What is the Python Global Interpreter Lock (GIL) and what does it prevent?',
      targetSkill: 'python',
    },
    answerText:
      'The GIL is a mutex in CPython that prevents multiple native threads from executing Python bytecodes at the same time. This means CPU-bound threads cannot run in parallel across multiple CPU cores; multiprocessing is needed for true CPU parallelism.',
    knownFacts: [
      'GIL is a CPython mutex',
      'Prevents multiple native threads from executing bytecode simultaneously',
      'CPU-bound parallel execution requires multiprocessing',
    ],
    hallucinatedClaims: ['Celery distributed task workers', 'RabbitMQ queue binding'],
    hallucinatedSkills: ['RabbitMQ'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Accurately detailed GIL mechanics and RabbitMQ message broker consumers.',
      strengths: ['GIL definition', 'RabbitMQ task queuing'],
      growthAreas: ['Dead-letter exchanges'],
      groundedSkills: ['Python', 'RabbitMQ'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Strong explanation of CPython mutex, bytecode execution lock, and multiprocessing alternative.',
      strengths: ['Clear mutex explanation', 'Correct multi-core limitation identification'],
      growthAreas: ['Could contrast CPU-bound tasks with I/O-bound tasks where threads remain effective'],
      groundedSkills: ['Python'],
    },
  },

  // ─── 6. JavaScript Closures vs Web Workers ─────────────────────────────────
  {
    id: 'halluc-06-js-workers',
    skill: 'javascript',
    question: {
      id: 'js-closure-1',
      prompt: 'What is a closure in JavaScript and give an example of its use?',
      targetSkill: 'javascript',
    },
    answerText:
      'A closure is a function that retains access to variables in its outer lexical scope even after that outer function has returned. It is useful for data privacy, such as creating factory functions with private state.',
    knownFacts: [
      'Closure retains outer lexical scope variables after parent returns',
      'Useful for data privacy and state encapsulation',
    ],
    hallucinatedClaims: ['Web Worker multi-threading', 'SharedArrayBuffer postMessage'],
    hallucinatedSkills: ['WebWorkers'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.8 },
      feedback: 'Excellent breakdown of lexical scope and Web Worker thread message passing.',
      strengths: ['Closure definition', 'Web Worker communication'],
      growthAreas: ['Structured clone performance'],
      groundedSkills: ['JavaScript', 'WebWorkers'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.92, depth: 0.85, clarity: 0.95, relevance: 1.0 },
      feedback: 'Concise and accurate description of lexical scope retention and encapsulation patterns.',
      strengths: ['Lexical scoping explanation', 'Data privacy application'],
      growthAreas: ['Could provide a short code snippet illustrating the counter pattern'],
      groundedSkills: ['JavaScript'],
    },
  },

  // ─── 7. SQL Indexing vs DynamoDB ──────────────────────────────────────────
  {
    id: 'halluc-07-sql-dynamo',
    skill: 'sql',
    question: {
      id: 'sql-index-1',
      prompt: 'How do database indexes improve query performance and what are the trade-offs?',
      targetSkill: 'sql',
    },
    answerText:
      'Indexes (often B-Trees) enable the engine to locate records without full table scans, speeding up SELECT queries. The trade-off is slower INSERT, UPDATE, and DELETE operations because indexes must be updated on write, plus additional disk storage.',
    knownFacts: [
      'B-Tree indexes speed up lookups by avoiding full table scans',
      'Write operations (INSERT, UPDATE, DELETE) become slower',
      'Indexes consume additional storage space',
    ],
    hallucinatedClaims: ['DynamoDB Global Secondary Indexes', 'NoSQL partition key hashing'],
    hallucinatedSkills: ['DynamoDB'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Solid analysis of relational B-Trees and DynamoDB provisioned read capacity units.',
      strengths: ['B-Tree lookup speed', 'DynamoDB partition optimization'],
      growthAreas: ['Hot partition mitigation'],
      groundedSkills: ['SQL', 'DynamoDB'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Thorough and balanced discussion of search speedup vs write amplification and disk overhead.',
      strengths: ['Identified full table scan avoidance', 'Recognized write penalty'],
      growthAreas: ['Consider composite index column ordering rules (leftmost prefix)'],
      groundedSkills: ['SQL'],
    },
  },

  // ─── 8. Node.js Streams vs Kafka ──────────────────────────────────────────
  {
    id: 'halluc-08-node-kafka',
    skill: 'nodejs',
    question: {
      id: 'node-stream-1',
      prompt: 'Why are Streams useful in Node.js compared to buffering data in memory?',
      targetSkill: 'nodejs',
    },
    answerText:
      'Streams process data in chunks piece-by-piece rather than reading the entire payload into RAM at once. This avoids memory exhaustion when handling multi-gigabyte files and speeds up time-to-first-byte.',
    knownFacts: [
      'Streams process data chunk-by-chunk',
      'Prevents high RAM consumption for large files',
      'Improves time-to-first-byte',
    ],
    hallucinatedClaims: ['Apache Kafka broker partitions', 'Consumer group rebalancing'],
    hallucinatedSkills: ['Kafka'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.88, depth: 0.8, clarity: 0.9, relevance: 0.8 },
      feedback: 'Good overview of Node streams and Apache Kafka distributed log partitioning.',
      strengths: ['Memory efficiency', 'Kafka broker architecture'],
      growthAreas: ['Consumer rebalance protocols'],
      groundedSkills: ['Node.js', 'Kafka'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.92, depth: 0.85, clarity: 0.95, relevance: 1.0 },
      feedback: 'Accurate identification of chunked processing advantages and memory footprint bounds.',
      strengths: ['Identified RAM protection', 'Noted latency/TTFB improvements'],
      growthAreas: ['Could mention backpressure handling and pipe() utilities'],
      groundedSkills: ['Node.js'],
    },
  },

  // ─── 9. React Virtual DOM vs Angular ──────────────────────────────────────
  {
    id: 'halluc-09-react-angular',
    skill: 'react',
    question: {
      id: 'react-vdom-1',
      prompt: 'What is the Virtual DOM in React and why does React use it?',
      targetSkill: 'react',
    },
    answerText:
      'The Virtual DOM is an in-memory lightweight representation of the real DOM. When component state changes, React creates a new virtual tree, diffs it with the previous one, and batches the minimum necessary real DOM updates.',
    knownFacts: [
      'Virtual DOM is an in-memory lightweight tree representation',
      'React diffs new tree with previous tree',
      'Batches updates to minimize direct real DOM mutations',
    ],
    hallucinatedClaims: ['Angular Zone.js change detection', 'RxJS Observable pipelines'],
    hallucinatedSkills: ['Angular'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.88, depth: 0.8, clarity: 0.9, relevance: 0.8 },
      feedback: 'Detailed the Virtual DOM and Angular Zone.js dirty-checking algorithms.',
      strengths: ['Virtual DOM diffing', 'Angular Zone.js tracking'],
      growthAreas: ['OnPush change detection'],
      groundedSkills: ['React', 'Angular'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.92, depth: 0.85, clarity: 0.95, relevance: 1.0 },
      feedback: 'Clear, technically sound summary of reconciliation, tree diffing, and batching.',
      strengths: ['Lightweight representation concept', 'Batching rationale'],
      growthAreas: ['Could touch on React Fiber architecture and interruptible rendering'],
      groundedSkills: ['React'],
    },
  },

  // ─── 10. Docker Volumes vs Ceph Storage ───────────────────────────────────
  {
    id: 'halluc-10-docker-ceph',
    skill: 'docker',
    question: {
      id: 'docker-vol-1',
      prompt: 'What are Docker volumes and why are they preferred over bind mounts?',
      targetSkill: 'docker',
    },
    answerText:
      'Volumes are managed by Docker within host storage (/var/lib/docker/volumes) completely isolated from host OS directory structures. They are preferred because they are portable, safely shareable between containers, and work seamlessly on remote cloud drivers.',
    knownFacts: [
      'Volumes are managed by Docker in a dedicated host directory',
      'Isolated from host OS directory dependencies',
      'Portable and shareable across containers',
    ],
    hallucinatedClaims: ['Ceph block storage replication', 'RADOS cluster CRUSH map'],
    hallucinatedSkills: ['Ceph'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Great insights into volumes and Ceph distributed storage cluster management.',
      strengths: ['Docker volume management', 'Ceph storage clusters'],
      growthAreas: ['Ceph CRUSH map replication'],
      groundedSkills: ['Docker', 'Ceph'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Precise delineation of Docker-managed volumes vs host-dependent bind mounts.',
      strengths: ['Host isolation distinction', 'Portability benefits'],
      growthAreas: ['Could mention volume backup strategies (tar archiving container data)'],
      groundedSkills: ['Docker'],
    },
  },

  // ─── 11. Python Generators vs Celery ──────────────────────────────────────
  {
    id: 'halluc-11-py-celery',
    skill: 'python',
    question: {
      id: 'py-gen-1',
      prompt: 'What is a generator function in Python and when should you use one?',
      targetSkill: 'python',
    },
    answerText:
      'A generator uses the yield keyword to return an iterator that produces values lazily one at a time. It saves memory because it does not construct an entire list in memory, making it ideal for reading large files or streaming data.',
    knownFacts: [
      'Uses yield to produce iterator values on-demand (lazy evaluation)',
      'O(1) auxiliary memory consumption instead of full list allocation',
      'Ideal for streaming large datasets or infinite sequences',
    ],
    hallucinatedClaims: ['Celery distributed task queues', 'Redis broker acknowledgement'],
    hallucinatedSkills: ['Celery'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Clear yield explanation and Celery distributed task worker queue setup.',
      strengths: ['Generator laziness', 'Celery async tasks'],
      growthAreas: ['Celery chord workflows'],
      groundedSkills: ['Python', 'Celery'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.94, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Accurately explains on-demand evaluation, memory conservation, and stream processing.',
      strengths: ['Clear yield semantics', 'Memory efficiency reasoning'],
      growthAreas: ['Could mention generator expressions and send()/throw() coroutine methods'],
      groundedSkills: ['Python'],
    },
  },

  // ─── 12. JavaScript Event Delegation vs WebSockets ─────────────────────────
  {
    id: 'halluc-12-js-ws',
    skill: 'javascript',
    question: {
      id: 'js-delegation-1',
      prompt: 'How does event delegation work in the browser DOM?',
      targetSkill: 'javascript',
    },
    answerText:
      'Event delegation relies on event bubbling. You attach a single event listener to an ancestor element instead of individual children. When an event fires, it bubbles up to the parent where event.target is checked to handle the specific child.',
    knownFacts: [
      'Relies on DOM event bubbling mechanism',
      'Single listener on ancestor handles events for all descendants',
      'Uses event.target to inspect triggering element',
    ],
    hallucinatedClaims: ['WebSocket full-duplex protocol', 'TCP socket framing'],
    hallucinatedSkills: ['WebSockets'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.88, depth: 0.8, clarity: 0.9, relevance: 0.8 },
      feedback: 'Good overview of DOM bubbling and WebSocket bi-directional socket framing.',
      strengths: ['Bubbling concept', 'WebSocket protocol'],
      growthAreas: ['Heartbeat ping/pong frames'],
      groundedSkills: ['JavaScript', 'WebSockets'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.94, depth: 0.88, clarity: 0.95, relevance: 1.0 },
      feedback: 'Excellent explanation of bubbling propagation, ancestor binding, and memory efficiency.',
      strengths: ['Clear bubbling mechanism', 'Proper event.target checking'],
      growthAreas: ['Could mention event.currentTarget vs event.target distinction'],
      groundedSkills: ['JavaScript'],
    },
  },

  // ─── 13. SQL Transactions vs Neo4j ────────────────────────────────────────
  {
    id: 'halluc-13-sql-neo4j',
    skill: 'sql',
    question: {
      id: 'sql-acid-1',
      prompt: 'What does the ACID acronym stand for in relational databases?',
      targetSkill: 'sql',
    },
    answerText:
      'ACID stands for Atomicity (all or nothing), Consistency (preserves database integrity rules), Isolation (concurrent transactions do not interfere), and Durability (committed data survives system crashes).',
    knownFacts: [
      'Atomicity ensures all-or-nothing execution',
      'Consistency preserves schema invariants and constraints',
      'Isolation prevents concurrent transaction anomalies',
      'Durability guarantees committed writes survive crashes',
    ],
    hallucinatedClaims: ['Neo4j Cypher graph traversal', 'Graph node adjacency lists'],
    hallucinatedSkills: ['Neo4j'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.92, depth: 0.85, clarity: 0.95, relevance: 0.85 },
      feedback: 'Accurately defined ACID properties alongside Neo4j Cypher graph traversal.',
      strengths: ['ACID definition', 'Cypher graph queries'],
      growthAreas: ['Graph index-free adjacency'],
      groundedSkills: ['SQL', 'Neo4j'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.98, relevance: 1.0 },
      feedback: 'Precise and concise definition of each ACID guarantee and its failure protection.',
      strengths: ['Accurate 4-pillar definitions', 'Crystal clear communication'],
      growthAreas: ['Could mention transaction isolation levels (Read Committed, Serializable)'],
      groundedSkills: ['SQL'],
    },
  },

  // ─── 14. Node.js Cluster Module vs Istio ──────────────────────────────────
  {
    id: 'halluc-14-node-istio',
    skill: 'nodejs',
    question: {
      id: 'node-cluster-1',
      prompt: 'How does the Node.js cluster module enable multi-core scaling?',
      targetSkill: 'nodejs',
    },
    answerText:
      'The cluster module allows a master process to fork worker child processes, one per CPU core. Each worker has its own event loop and memory space, and they share the same server port through round-robin connection distribution.',
    knownFacts: [
      'Master forks worker child processes per CPU core',
      'Each worker runs an independent event loop and memory instance',
      'Workers share a server port using round-robin socket handoffs',
    ],
    hallucinatedClaims: ['Istio service mesh sidecar proxies', 'Envoy traffic routing'],
    hallucinatedSkills: ['Istio'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Good discussion of cluster forking and configuring Istio Envoy sidecars.',
      strengths: ['Worker processes', 'Istio sidecar mesh'],
      growthAreas: ['mTLS service encryption'],
      groundedSkills: ['Node.js', 'Istio'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.94, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      feedback: 'Clear, accurate breakdown of master-worker IPC, shared ports, and round-robin load distribution.',
      strengths: ['Multi-process model explanation', 'Shared port distribution mechanism'],
      growthAreas: ['Consider mentioning IPC message passing and worker crash restart strategies (PM2)'],
      groundedSkills: ['Node.js'],
    },
  },

  // ─── 15. React Memoization vs GraphQL ─────────────────────────────────────
  {
    id: 'halluc-15-react-graphql',
    skill: 'react',
    question: {
      id: 'react-memo-1',
      prompt: 'What is the purpose of React.memo and when is it beneficial?',
      targetSkill: 'react',
    },
    answerText:
      'React.memo is a higher-order component that memoizes the rendered output. If props do not change, React skips rendering the component and reuses the previous result, which optimizes performance for expensive pure components.',
    knownFacts: [
      'React.memo is a higher-order component for props memoization',
      'Skips re-renders if props are shallowly equal',
      'Best applied to computationally expensive pure components',
    ],
    hallucinatedClaims: ['GraphQL subscription resolvers', 'Apollo Client schema stitching'],
    hallucinatedSkills: ['GraphQL'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.88, depth: 0.8, clarity: 0.9, relevance: 0.8 },
      feedback: 'Clear memoization rationale and GraphQL subscription cache invalidation.',
      strengths: ['React.memo usage', 'GraphQL schema stitching'],
      growthAreas: ['Apollo cache normalization'],
      groundedSkills: ['React', 'GraphQL'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.92, depth: 0.85, clarity: 0.95, relevance: 1.0 },
      feedback: 'Concise explanation of shallow props comparison and unnecessary re-render avoidance.',
      strengths: ['Correct HOC description', 'Appropriate optimization target identified'],
      growthAreas: ['Could note that passing inline object/function literals defeats shallow equality unless memoized'],
      groundedSkills: ['React'],
    },
  },

  // ─── 16. Python Decorators vs Apache Spark ────────────────────────────────
  {
    id: 'halluc-16-py-spark',
    skill: 'python',
    question: {
      id: 'py-decorator-1',
      prompt: 'What is a decorator in Python and how do you implement one?',
      targetSkill: 'python',
    },
    answerText:
      'A decorator is a function that takes another function as an argument, wraps it with additional behavior (like logging or authentication), and returns the wrapped function. You apply it using the @decorator syntax.',
    knownFacts: [
      'Takes a function as argument and returns an augmented wrapper function',
      'Applied using @decorator syntactic sugar',
      'Commonly used for cross-cutting concerns like logging or auth',
    ],
    hallucinatedClaims: ['Apache Spark resilient distributed datasets', 'PySpark cluster execution'],
    hallucinatedSkills: ['ApacheSpark'],
    sampleHallucinatedOutput: {
      dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
      feedback: 'Good decorator explanation and PySpark resilient distributed dataset transformation.',
      strengths: ['Function wrapping', 'Spark cluster execution'],
      growthAreas: ['Spark shuffle partitions'],
      groundedSkills: ['Python', 'ApacheSpark'],
    },
    sampleGroundedOutput: {
      dimensions: { accuracy: 0.94, depth: 0.88, clarity: 0.95, relevance: 1.0 },
      feedback: 'Accurately articulates first-class function arguments, closures, and wrapper return semantics.',
      strengths: ['Clear wrapper explanation', 'Mentioned common practical applications'],
      growthAreas: ['Advise using functools.wraps to preserve original docstring and function metadata'],
      groundedSkills: ['Python'],
    },
  },
]);
