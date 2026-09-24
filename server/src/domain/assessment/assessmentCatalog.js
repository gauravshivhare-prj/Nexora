import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  validateAssessmentDefinition,
} from './assessmentContract.js';
import { skillKey } from '../skills/skillKey.js';

/**
 * Canonical curated assessments representing core skills in Nexora's taxonomy.
 * Every assessment definition here complies strictly with the deterministic
 * assessment domain contract.
 */
export const ASSESSMENT_CATALOG = Object.freeze([
  {
    id: 'asm_javascript_intermediate',
    version: 1,
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'JavaScript Core & Asynchronous Runtime',
    description: 'Measures proficiency in closures, event loop execution order, promises, and scoping.',
    passMark: 0.7,
    timeLimitMinutes: 20,
    questions: [
      {
        id: 'q_js_event_loop',
        type: QUESTION_TYPES.CODE_OUTPUT,
        prompt: 'What is the exact console output of running the following asynchronous code snippet?',
        codeSnippet: `console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');`,
        weight: 1,
        expectedAnswer: {
          expectedOutput: '1\n4\n3\n2',
          trimWhitespace: true,
          caseSensitive: true,
        },
        explanation: 'Synchronous code runs first (1, 4). Microtasks in Promise.then run next (3). Macrotasks like setTimeout run last (2).',
      },
      {
        id: 'q_js_closures',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'Which statement accurately describes a closure in JavaScript?',
        weight: 1,
        options: [
          { id: 'opt_a', text: 'A function bundled together with references to its surrounding lexical environment.' },
          { id: 'opt_b', text: 'An immediately invoked function expression (IIFE) that runs synchronously.' },
          { id: 'opt_c', text: 'A syntax error occurring when a block is not closed with a curly brace.' },
          { id: 'opt_d', text: 'A method to forcibly terminate execution of a generator function.' },
        ],
        expectedAnswer: {
          correctOptionId: 'opt_a',
        },
        explanation: 'A closure is the combination of a function bundled together (enclosed) with references to its surrounding state (lexical environment).',
      },
      {
        id: 'q_js_primitives',
        type: QUESTION_TYPES.MULTIPLE_CHOICE,
        prompt: 'Which of the following are primitive data types in JavaScript? (Select all that apply)',
        weight: 1,
        options: [
          { id: 'opt_symbol', text: 'Symbol' },
          { id: 'opt_bigint', text: 'BigInt' },
          { id: 'opt_map', text: 'Map' },
          { id: 'opt_undefined', text: 'undefined' },
        ],
        expectedAnswer: {
          correctOptionIds: ['opt_symbol', 'opt_bigint', 'opt_undefined'],
          strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
        },
        explanation: 'Symbol, BigInt, and undefined are primitives. Map is a built-in object collection.',
      },
      {
        id: 'q_js_equality',
        type: QUESTION_TYPES.SHORT_ANSWER,
        prompt: 'What keyword or operator should be used for strict equality comparison that does not perform type coercion?',
        weight: 1,
        expectedAnswer: {
          acceptedAnswers: ['===', 'Object.is'],
          caseSensitive: false,
          trimWhitespace: true,
        },
        explanation: '=== is the strict equality operator in JavaScript.',
      },
      {
        id: 'q_js_const_mutation',
        type: QUESTION_TYPES.BOOLEAN,
        prompt: 'True or False: Declaring an object with `const` prevents the mutation of that object\'s properties.',
        weight: 1,
        expectedAnswer: {
          expectedValue: false,
        },
        explanation: 'const prevents re-assignment of the variable identifier, but does not make the object immutable.',
      },
    ],
  },
  {
    id: 'asm_nodejs_intermediate',
    version: 1,
    skillKey: 'Node.js',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'Node.js Architecture, Streams & Event Loop',
    description: 'Evaluates knowledge of libuv event loop phases, process.nextTick, streams, and module resolution.',
    passMark: 0.7,
    timeLimitMinutes: 25,
    questions: [
      {
        id: 'q_node_tick_vs_promise',
        type: QUESTION_TYPES.CODE_OUTPUT,
        prompt: 'What is the exact stdout output of this Node.js process?',
        codeSnippet: `process.nextTick(() => console.log('tick'));
Promise.resolve().then(() => console.log('promise'));
console.log('main');`,
        weight: 1,
        expectedAnswer: {
          expectedOutput: 'main\ntick\npromise',
          trimWhitespace: true,
          caseSensitive: true,
        },
        explanation: 'main runs synchronously. The nextTickQueue is processed immediately after the current operation and before the Promise microtask queue.',
      },
      {
        id: 'q_node_streams',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'Which stream mode in Node.js automatically handles backpressure when piping a readable stream to a writable stream?',
        weight: 1,
        options: [
          { id: 'opt_pipe', text: 'readable.pipe(writable)' },
          { id: 'opt_manual', text: 'Listening to readable.on("data") and calling writable.write()' },
          { id: 'opt_pause', text: 'Calling readable.pause() synchronously in a loop' },
          { id: 'opt_unshift', text: 'Calling readable.unshift() on buffer overflow' },
        ],
        expectedAnswer: {
          correctOptionId: 'opt_pipe',
        },
        explanation: 'readable.pipe(writable) automatically manages backpressure so that a slow destination is not overwhelmed by a faster readable stream.',
      },
      {
        id: 'q_node_cluster',
        type: QUESTION_TYPES.BOOLEAN,
        prompt: 'True or False: Node.js worker threads share memory via SharedArrayBuffer, whereas processes spawned by the cluster module do not share memory by default.',
        weight: 1,
        expectedAnswer: {
          expectedValue: true,
        },
        explanation: 'Worker threads run within the same process and can share memory, whereas cluster forks separate OS processes with isolated memory.',
      },
    ],
  },
  {
    id: 'asm_mongodb_intermediate',
    version: 1,
    skillKey: 'MongoDB',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'MongoDB Querying, Aggregation & Indexing',
    description: 'Tests expertise in document modeling, compound indexes, and aggregation stages.',
    passMark: 0.7,
    timeLimitMinutes: 20,
    questions: [
      {
        id: 'q_mongo_stages',
        type: QUESTION_TYPES.MULTIPLE_CHOICE,
        prompt: 'Which of the following are valid aggregation pipeline stages in MongoDB? (Select all that apply)',
        weight: 1,
        options: [
          { id: 'opt_match', text: '$match' },
          { id: 'opt_group', text: '$group' },
          { id: 'opt_lookup', text: '$lookup' },
          { id: 'opt_select', text: '$select' },
        ],
        expectedAnswer: {
          correctOptionIds: ['opt_match', 'opt_group', 'opt_lookup'],
          strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
        },
        explanation: '$match, $group, and $lookup are standard stages. $select does not exist in MongoDB ($project is used).',
      },
      {
        id: 'q_mongo_esr',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'What does the ESR rule stand for when designing compound indexes in MongoDB?',
        weight: 1,
        options: [
          { id: 'opt_esr', text: 'Equality, Sort, Range' },
          { id: 'opt_wrong1', text: 'Entity, Schema, Relation' },
          { id: 'opt_wrong2', text: 'Execution, Sharding, Replication' },
          { id: 'opt_wrong3', text: 'Estimate, Scan, Return' },
        ],
        expectedAnswer: {
          correctOptionId: 'opt_esr',
        },
        explanation: 'The ESR rule states index keys should be ordered Equality first, Sort second, and Range third.',
      },
    ],
  },
  {
    id: 'asm_docker_beginner',
    version: 1,
    skillKey: 'Docker',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    title: 'Docker Fundamentals & Containerization',
    description: 'Basic concepts of images, containers, Dockerfile instructions, and port binding.',
    passMark: 0.7,
    timeLimitMinutes: 15,
    questions: [
      {
        id: 'q_docker_instruction',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'Which Dockerfile instruction sets the base image for subsequent instructions?',
        weight: 1,
        options: [
          { id: 'opt_from', text: 'FROM' },
          { id: 'opt_run', text: 'RUN' },
          { id: 'opt_base', text: 'BASE' },
          { id: 'opt_init', text: 'INIT' },
        ],
        expectedAnswer: {
          correctOptionId: 'opt_from',
        },
        explanation: 'FROM specifies the parent/base image to build upon.',
      },
      {
        id: 'q_docker_cli',
        type: QUESTION_TYPES.SHORT_ANSWER,
        prompt: 'What Docker CLI command is used to remove all stopped containers?',
        weight: 1,
        expectedAnswer: {
          acceptedAnswers: ['docker container prune', 'docker container prune -f', 'docker system prune'],
          caseSensitive: false,
          trimWhitespace: true,
        },
        explanation: 'docker container prune deletes all stopped containers.',
      },
    ],
  },
  {
    id: 'asm_python_beginner',
    version: 1,
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    title: 'Python Language Fundamentals',
    description: 'Evaluates basic syntax, list comprehensions, slicing, and mutable vs immutable data types.',
    passMark: 0.7,
    timeLimitMinutes: 15,
    questions: [
      {
        id: 'q_py_slice',
        type: QUESTION_TYPES.CODE_OUTPUT,
        prompt: 'What is the output of the following Python expression?',
        codeSnippet: `nums = [10, 20, 30, 40, 50]
print(nums[1:4])`,
        weight: 1,
        expectedAnswer: {
          expectedOutput: '[20, 30, 40]',
          trimWhitespace: true,
          caseSensitive: true,
        },
        explanation: 'Slice [1:4] includes indices 1, 2, and 3: [20, 30, 40].',
      },
      {
        id: 'q_py_immutability',
        type: QUESTION_TYPES.MULTIPLE_CHOICE,
        prompt: 'Which of the following built-in types in Python are immutable? (Select all that apply)',
        weight: 1,
        options: [
          { id: 'opt_tuple', text: 'tuple' },
          { id: 'opt_str', text: 'str' },
          { id: 'opt_list', text: 'list' },
          { id: 'opt_int', text: 'int' },
        ],
        expectedAnswer: {
          correctOptionIds: ['opt_tuple', 'opt_str', 'opt_int'],
          strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
        },
        explanation: 'tuple, str, and int are immutable. list is mutable.',
      },
    ],
  },
]);

// Validated catalog map indexed by ID
const CATALOG_BY_ID = new Map(
  ASSESSMENT_CATALOG.map((raw) => {
    const validated = validateAssessmentDefinition(raw);
    return [validated.id, validated];
  }),
);

/**
 * Returns all validated assessments in the catalog.
 *
 * @returns {object[]}
 */
export function getAssessmentCatalog() {
  return [...CATALOG_BY_ID.values()];
}

/**
 * Retrieves a single validated assessment by ID.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function getAssessmentById(id) {
  if (typeof id !== 'string') return null;
  return CATALOG_BY_ID.get(id.trim()) ?? null;
}

/**
 * Retrieves all validated assessments that assess a specific skill.
 * Matches against canonical skill key.
 *
 * @param {string} skillNameOrKey
 * @returns {object[]}
 */
export function getAssessmentsForSkill(skillNameOrKey) {
  if (typeof skillNameOrKey !== 'string') return [];
  const targetKey = skillKey(skillNameOrKey);
  if (!targetKey) return [];

  return [...CATALOG_BY_ID.values()].filter((asm) => {
    return (
      asm.skillKey === targetKey ||
      asm.secondarySkillKeys.includes(targetKey)
    );
  });
}
