import { canonicalSkill, skillKey } from '../skills/skillKey.js';
import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_LEVEL_VALUES,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  validateAssessmentDefinition,
} from './assessmentContract.js';
import { ASSESSMENT_LIMITS } from '../../constants/assessmentPolicy.js';

/**
 * Question Bank Version.
 */
export const QUESTION_BANK_VERSION = 1;

/**
 * Curated, original question bank aligned strictly to Nexora's canonical taxonomy (Taxonomy v2).
 * Every question is original, unambiguous, answerable, and grounded in a canonical skill.
 */
const RAW_QUESTION_BANK = Object.freeze([
  // =========================================================================
  // JavaScript (canonical: javascript)
  // =========================================================================
  {
    id: 'qb_js_beg_equality',
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'What is the return value of `typeof null` in standard ECMAScript?',
    options: [
      { id: 'opt_obj', text: '"object"' },
      { id: 'opt_null', text: '"null"' },
      { id: 'opt_undef', text: '"undefined"' },
      { id: 'opt_bool', text: '"boolean"' },
    ],
    expectedAnswer: { correctOptionId: 'opt_obj' },
    explanation: 'Due to a historical legacy in JavaScript binary type tagging, typeof null evaluates to "object".',
  },
  {
    id: 'qb_js_beg_arrays',
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.CODE_OUTPUT,
    prompt: 'What is the exact output of the following array operation?',
    codeSnippet: `const numbers = [1, 2, 3];
numbers.push(4);
console.log(numbers.length);`,
    expectedAnswer: {
      expectedOutput: '4',
      trimWhitespace: true,
      caseSensitive: true,
    },
    explanation: 'push(4) appends 4 to the array, increasing its length to 4.',
  },
  {
    id: 'qb_js_int_eventloop',
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.CODE_OUTPUT,
    prompt: 'What is the exact console output of this code snippet demonstrating the JavaScript event loop?',
    codeSnippet: `console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');`,
    expectedAnswer: {
      expectedOutput: 'A\nD\nC\nB',
      trimWhitespace: true,
      caseSensitive: true,
    },
    explanation: 'Synchronous statements run first ("A", "D"). Microtasks (Promise.then) run next ("C"). Macrotasks (setTimeout) execute in the next tick ("B").',
  },
  {
    id: 'qb_js_int_closures',
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'In JavaScript, how does an inner function retain access to variables declared in its enclosing function after the outer function has returned?',
    options: [
      { id: 'opt_closure', text: 'Through a closure that keeps a reference to the outer lexical environment.' },
      { id: 'opt_global', text: 'By automatically copying outer variables into the global window/globalThis scope.' },
      { id: 'opt_eval', text: 'By serializing the outer function scope using internal JSON serialization.' },
      { id: 'opt_stack', text: 'By freezing the outer call stack frame permanently in memory.' },
    ],
    expectedAnswer: { correctOptionId: 'opt_closure' },
    explanation: 'A closure retains a reference to its surrounding lexical environment, allowing the inner function to access those variables even after the outer function finishes execution.',
  },
  {
    id: 'qb_js_adv_weakmap',
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.ADVANCED,
    type: QUESTION_TYPES.BOOLEAN,
    prompt: 'True or False: Keys in a JavaScript WeakMap must be garbage-collectible objects or non-registered symbols, and WeakMap keys are not enumerable.',
    expectedAnswer: { expectedValue: true },
    explanation: 'WeakMap keys must be objects or non-registered symbols, allowing garbage collection when no other references exist. Because of this, WeakMaps do not allow key enumeration.',
  },

  // =========================================================================
  // Python (canonical: python)
  // =========================================================================
  {
    id: 'qb_py_beg_types',
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.MULTIPLE_CHOICE,
    prompt: 'Which of the following built-in Python data types are mutable? (Select all that apply)',
    options: [
      { id: 'opt_list', text: 'list' },
      { id: 'opt_dict', text: 'dict' },
      { id: 'opt_tuple', text: 'tuple' },
      { id: 'opt_set', text: 'set' },
    ],
    expectedAnswer: {
      correctOptionIds: ['opt_list', 'opt_dict', 'opt_set'],
      strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
    },
    explanation: 'Lists, dictionaries, and sets are mutable in Python. Tuples are immutable.',
  },
  {
    id: 'qb_py_beg_slice',
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.CODE_OUTPUT,
    prompt: 'What does the following slice expression evaluate to in Python?',
    codeSnippet: `word = "Python"
print(word[1:4])`,
    expectedAnswer: {
      expectedOutput: 'yth',
      trimWhitespace: true,
      caseSensitive: true,
    },
    explanation: 'Slice [1:4] takes indices 1, 2, and 3 ("y", "t", "h").',
  },
  {
    id: 'qb_py_int_decorator',
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'In Python, what is the syntax `@decorator` placed above a function definition equivalent to?',
    options: [
      { id: 'opt_wrap', text: 'fn = decorator(fn)' },
      { id: 'opt_sub', text: 'class fn(decorator): pass' },
      { id: 'opt_async', text: 'async fn = await decorator(fn)' },
      { id: 'opt_import', text: 'from decorator import fn' },
    ],
    expectedAnswer: { correctOptionId: 'opt_wrap' },
    explanation: 'The decorator syntax @decorator above def fn(): ... is syntactic sugar for fn = decorator(fn).',
  },
  {
    id: 'qb_py_adv_gil',
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.ADVANCED,
    type: QUESTION_TYPES.BOOLEAN,
    prompt: 'True or False: In standard CPython, the Global Interpreter Lock (GIL) prevents multiple native OS threads from executing Python bytecodes concurrently on multiple CPU cores.',
    expectedAnswer: { expectedValue: true },
    explanation: 'The CPython GIL is a mutex that prevents multiple native threads from executing Python bytecodes simultaneously across CPU cores, restricting CPU-bound parallelism in threads.',
  },

  // =========================================================================
  // Node.js (canonical: nodejs)
  // =========================================================================
  {
    id: 'qb_node_beg_modules',
    skillKey: 'Node.js',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'Which built-in Node.js module provides utilities for joining, resolving, and normalizing filesystem paths?',
    options: [
      { id: 'opt_path', text: 'path' },
      { id: 'opt_fs', text: 'fs' },
      { id: 'opt_os', text: 'os' },
      { id: 'opt_url', text: 'url' },
    ],
    expectedAnswer: { correctOptionId: 'opt_path' },
    explanation: 'The "path" module provides utilities for working with file and directory paths (e.g., path.join, path.resolve).',
  },
  {
    id: 'qb_node_int_nexttick',
    skillKey: 'Node.js',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'When does a callback registered with `process.nextTick()` execute relative to the event loop phases?',
    options: [
      { id: 'opt_immediate', text: 'Immediately after the currently executing operation completes, before the event loop continues.' },
      { id: 'opt_check', text: 'Only in the check phase after setImmediate callbacks.' },
      { id: 'opt_timer', text: 'In the timers phase along with setTimeout.' },
      { id: 'opt_idle', text: 'During the idle phase when no I/O is pending.' },
    ],
    expectedAnswer: { correctOptionId: 'opt_immediate' },
    explanation: 'process.nextTick callbacks are queued in the nextTickQueue and drained immediately after the current operation finishes, before entering the next phase.',
  },
  {
    id: 'qb_node_adv_clusters',
    skillKey: 'Node.js',
    difficulty: DIFFICULTY_LEVELS.ADVANCED,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'How does Node.js cluster module differ fundamentally from the worker_threads module?',
    options: [
      { id: 'opt_fork', text: 'cluster forks separate OS processes with isolated memory; worker_threads run in one process and can share memory.' },
      { id: 'opt_shared', text: 'cluster processes share a single heap; worker_threads fork separate operating system kernels.' },
      { id: 'opt_single', text: 'cluster supports only single-threaded async I/O; worker_threads can only execute C++ bindings.' },
      { id: 'opt_none', text: 'There is no difference; cluster is an alias for worker_threads.' },
    ],
    expectedAnswer: { correctOptionId: 'opt_fork' },
    explanation: 'The cluster module creates separate child processes that share server ports, whereas worker_threads creates threads within a single process that can share memory via SharedArrayBuffer.',
  },

  // =========================================================================
  // SQL (canonical: sql)
  // =========================================================================
  {
    id: 'qb_sql_beg_select',
    skillKey: 'SQL',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SHORT_ANSWER,
    prompt: 'Which SQL clause is used to eliminate duplicate rows from the query result set?',
    expectedAnswer: {
      acceptedAnswers: ['DISTINCT', 'SELECT DISTINCT'],
      caseSensitive: false,
      trimWhitespace: true,
    },
    explanation: 'The DISTINCT keyword in a SELECT statement removes duplicate rows from the returned output.',
  },
  {
    id: 'qb_sql_int_exec_order',
    skillKey: 'SQL',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'In standard SQL logical query processing, which clause is evaluated BEFORE the SELECT clause?',
    options: [
      { id: 'opt_having', text: 'HAVING' },
      { id: 'opt_order', text: 'ORDER BY' },
      { id: 'opt_limit', text: 'LIMIT / OFFSET' },
      { id: 'opt_select', text: 'SELECT is evaluated first of all' },
    ],
    expectedAnswer: { correctOptionId: 'opt_having' },
    explanation: 'Logical SQL evaluation order is: FROM -> ON -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT.',
  },
  {
    id: 'qb_sql_adv_window',
    skillKey: 'SQL',
    difficulty: DIFFICULTY_LEVELS.ADVANCED,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'What clause in SQL defines the partition and order for a window function like `ROW_NUMBER()` or `RANK()`?',
    options: [
      { id: 'opt_over', text: 'OVER (PARTITION BY ... ORDER BY ...)' },
      { id: 'opt_group', text: 'GROUP BY WITH ROLLUP' },
      { id: 'opt_window', text: 'CONNECT BY PRIOR' },
      { id: 'opt_partition', text: 'INDEX PARTITION BY' },
    ],
    expectedAnswer: { correctOptionId: 'opt_over' },
    explanation: 'Window functions use the OVER clause to specify partitioning and ordering of the window frame without collapsing rows.',
  },

  // =========================================================================
  // Docker (canonical: docker)
  // =========================================================================
  {
    id: 'qb_docker_beg_cmd_entry',
    skillKey: 'Docker',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'When both ENTRYPOINT and CMD are defined in a Dockerfile in exec form, what role does CMD serve?',
    options: [
      { id: 'opt_args', text: 'It supplies default arguments to the executable defined by ENTRYPOINT.' },
      { id: 'opt_override', text: 'It completely overrides ENTRYPOINT and executes independently.' },
      { id: 'opt_build', text: 'It runs at image build time, while ENTRYPOINT runs at container runtime.' },
      { id: 'opt_env', text: 'It sets default environment variables inside the container.' },
    ],
    expectedAnswer: { correctOptionId: 'opt_args' },
    explanation: 'When ENTRYPOINT is specified in exec form, CMD acts as default parameters that can be overridden by arguments passed to docker run.',
  },
  {
    id: 'qb_docker_int_multistage',
    skillKey: 'Docker',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.BOOLEAN,
    prompt: 'True or False: Multi-stage Docker builds allow copying built artifacts from one stage to another using `COPY --from=<stage_name>`, producing a smaller final image without build toolchains.',
    expectedAnswer: { expectedValue: true },
    explanation: 'Multi-stage builds leave compiler toolchains and intermediate files in earlier build stages, copying only final binaries/assets to the production image.',
  },

  // =========================================================================
  // Git (canonical: git)
  // =========================================================================
  {
    id: 'qb_git_beg_staging',
    skillKey: 'Git',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SHORT_ANSWER,
    prompt: 'What command moves working directory changes into the Git staging area (index)?',
    expectedAnswer: {
      acceptedAnswers: ['git add', 'git add .', 'git add -A'],
      caseSensitive: false,
      trimWhitespace: true,
    },
    explanation: '"git add" adds file modifications in the working directory to the staging area.',
  },
  {
    id: 'qb_git_int_rebase_merge',
    skillKey: 'Git',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'What is the primary difference between `git merge feature` and `git rebase main` on a feature branch?',
    options: [
      { id: 'opt_linear', text: 'Rebase rewrites commit history onto the target base for a linear history, whereas merge preserves original commit topology with a merge commit.' },
      { id: 'opt_delete', text: 'Rebase deletes all uncommitted files, while merge saves them to stash.' },
      { id: 'opt_push', text: 'Merge requires force-pushing, while rebase never requires force-pushing.' },
      { id: 'opt_tag', text: 'Rebase creates an annotated tag for each commit, while merge creates none.' },
    ],
    expectedAnswer: { correctOptionId: 'opt_linear' },
    explanation: 'Rebase replays branch commits on top of another base creating new commit hashes, keeping history linear. Merge preserves historical topology.',
  },

  // =========================================================================
  // Data Structures and Algorithms (canonical: datastructuresandalgorithms)
  // =========================================================================
  {
    id: 'qb_dsa_beg_queue',
    skillKey: 'Data Structures and Algorithms',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'Which ordering principle governs a standard Queue data structure?',
    options: [
      { id: 'opt_fifo', text: 'First-In, First-Out (FIFO)' },
      { id: 'opt_lifo', text: 'Last-In, First-Out (LIFO)' },
      { id: 'opt_random', text: 'Random Access (O(1))' },
      { id: 'opt_priority', text: 'Highest Key First' },
    ],
    expectedAnswer: { correctOptionId: 'opt_fifo' },
    explanation: 'A queue processes elements in FIFO (First-In, First-Out) order. Stacks use LIFO.',
  },
  {
    id: 'qb_dsa_int_binarysearch',
    skillKey: 'Data Structures and Algorithms',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'What is the worst-case time complexity of Binary Search on a sorted array of N elements?',
    options: [
      { id: 'opt_logn', text: 'O(log N)' },
      { id: 'opt_n', text: 'O(N)' },
      { id: 'opt_nlogn', text: 'O(N log N)' },
      { id: 'opt_1', text: 'O(1)' },
    ],
    expectedAnswer: { correctOptionId: 'opt_logn' },
    explanation: 'Binary search halves the search space at each comparison step, yielding logarithmic time complexity O(log N).',
  },
]);

// Internal validation and deterministic sorting
const VALIDATED_QUESTIONS = RAW_QUESTION_BANK.map((item) => {
  const canonical = canonicalSkill(item.skillKey);
  if (!canonical) {
    throw new Error(`Question bank item "${item.id}" has unknown skillKey: "${item.skillKey}".`);
  }
  if (!DIFFICULTY_LEVEL_VALUES.includes(item.difficulty)) {
    throw new Error(`Question bank item "${item.id}" has invalid difficulty: "${item.difficulty}".`);
  }

  return Object.freeze({
    id: String(item.id).trim(),
    skillKey: canonical.key,
    skillName: canonical.name,
    difficulty: item.difficulty,
    type: item.type,
    prompt: item.prompt.trim(),
    weight: item.weight ?? 1,
    codeSnippet: item.codeSnippet ?? null,
    options: item.options ? item.options.map((o) => ({ id: o.id.trim(), text: o.text.trim() })) : undefined,
    expectedAnswer: item.expectedAnswer,
    explanation: item.explanation?.trim() ?? null,
  });
}).sort((a, b) => a.id.localeCompare(b.id));

// Indexed map for fast O(1) retrieval
const QUESTION_MAP = new Map(VALIDATED_QUESTIONS.map((q) => [q.id, q]));

/**
 * Returns all questions in the bank sorted deterministically by ID.
 *
 * @returns {object[]}
 */
export function getQuestionBank() {
  return [...VALIDATED_QUESTIONS];
}

/**
 * Retrieves a single question by its unique ID.
 *
 * @param {string} questionId
 * @returns {object|null}
 */
export function getQuestionById(questionId) {
  if (typeof questionId !== 'string') return null;
  return QUESTION_MAP.get(questionId.trim()) ?? null;
}

/**
 * Retrieves questions for a specific skill and difficulty deterministically.
 *
 * @param {object} params
 * @param {string} params.skill Skill name or alias
 * @param {string} [params.difficulty] Optional difficulty filter
 * @param {number} [params.limit] Max number of questions to return
 * @returns {object[]}
 */
export function getQuestionsForSkill({ skill, difficulty, limit } = {}) {
  if (!skill || typeof skill !== 'string') return [];

  const targetKey = skillKey(skill);
  if (!targetKey) return [];

  let filtered = VALIDATED_QUESTIONS.filter((q) => q.skillKey === targetKey);

  if (difficulty && DIFFICULTY_LEVEL_VALUES.includes(difficulty)) {
    filtered = filtered.filter((q) => q.difficulty === difficulty);
  }

  // Deterministic order is preserved (already sorted by id)
  if (limit && Number.isInteger(limit) && limit > 0) {
    return filtered.slice(0, limit);
  }

  return filtered;
}

/**
 * Dynamically and deterministically assembles a validated assessment definition
 * from questions in the question bank.
 *
 * @param {object} params
 * @param {string} params.id Assessment ID (e.g. 'asm_js_core')
 * @param {string} params.skill Canonical skill name or alias
 * @param {string} params.difficulty Difficulty tier
 * @param {number} [params.questionCount=3] Number of questions to pick
 * @param {string} [params.title] Title
 * @param {string} [params.description] Description
 * @param {number} [params.passMark=0.70] Pass mark
 * @param {number} [params.timeLimitMinutes=20] Time limit
 * @returns {object} Validated assessment definition
 */
export function assembleAssessmentFromBank({
  id,
  skill,
  difficulty = DIFFICULTY_LEVELS.INTERMEDIATE,
  questionCount = 3,
  title,
  description,
  passMark = 0.7,
  timeLimitMinutes = 20,
}) {
  const canonical = canonicalSkill(skill);
  if (!canonical) {
    throw new Error(`Unknown canonical skill: "${skill}".`);
  }

  const available = getQuestionsForSkill({ skill: canonical.name, difficulty });

  // If not enough for the exact difficulty, fallback to any difficulty for this skill
  let chosen = available.slice(0, questionCount);
  if (chosen.length < questionCount) {
    const allForSkill = getQuestionsForSkill({ skill: canonical.name });
    const additional = allForSkill.filter((q) => !chosen.some((c) => c.id === q.id));
    chosen = [...chosen, ...additional].slice(0, questionCount);
  }

  if (chosen.length === 0) {
    throw new Error(`No questions available in question bank for skill "${canonical.name}".`);
  }

  const assessmentId = id || `asm_${canonical.key}_${difficulty}`;
  const assessmentTitle = title || `${canonical.name} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Assessment`;
  const assessmentDesc = description || `Curated assessment evaluating ${canonical.name} proficiency at ${difficulty} level.`;

  return validateAssessmentDefinition({
    id: assessmentId,
    version: QUESTION_BANK_VERSION,
    skillKey: canonical.name,
    difficulty,
    title: assessmentTitle,
    description: assessmentDesc,
    passMark,
    timeLimitMinutes,
    questions: chosen.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      weight: q.weight,
      codeSnippet: q.codeSnippet,
      options: q.options,
      expectedAnswer: q.expectedAnswer,
      explanation: q.explanation,
    })),
  });
}
