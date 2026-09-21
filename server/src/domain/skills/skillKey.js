/**
 * Canonical identity for a skill.
 *
 * The same skill reaches Nexora spelled several ways. A student types
 * "Node.js" in their profile, their resume says "NodeJS", a role definition
 * says "Node", and an assessment will one day say "node.js". Compared as
 * strings those are four skills, and every match, gap and roadmap built on
 * them would be wrong — a student would be told to learn something they
 * already listed.
 *
 * So nothing downstream compares skill *names*. It compares keys from here.
 *
 * Two mechanisms, in order:
 *
 *  1. **Normalisation** collapses the differences that are purely spelling:
 *     case, punctuation, spacing. "Node.js", "NODE JS" and "node-js" all
 *     become `nodejs`. This is mechanical and needs no maintenance.
 *  2. **Aliases** handle the differences that are not: "js" and "javascript"
 *     normalise differently but mean the same thing. This is a curated list
 *     and it is deliberately short.
 *
 * On the alias list: it is a judgement about what students mean, not a
 * taxonomy. Every entry is a name-for-the-same-thing, never a related or
 * broader skill. React and React Native are not aliases; neither are SQL and
 * PostgreSQL. Merging those would make a gap disappear that a student really
 * has, which is the failure mode this module exists to avoid. When in doubt,
 * leave a pair unmerged: two keys for one skill shows up as a duplicate a
 * student can see, while one key for two skills hides a gap they cannot.
 */

/**
 * Curated synonyms, written as `variant → canonical name`.
 *
 * Keys are compared after normalisation, so only genuinely different words
 * need an entry — "Node.js" vs "nodejs" does not.
 *
 * The value is the display name. Storing it here means a career role and a
 * student profile that spell a skill differently still agree on one label to
 * show, rather than whichever happened to be read first.
 */
const ALIASES = new Map([
  // --- Languages ---
  ['js', 'JavaScript'],
  ['ecmascript', 'JavaScript'],
  ['ts', 'TypeScript'],
  ['py', 'Python'],
  ['python3', 'Python'],
  ['golang', 'Go'],
  ['cpp', 'C++'],
  ['cplusplus', 'C++'],
  ['csharp', 'C#'],
  ['dotnet', '.NET'],

  // --- Runtimes and frameworks ---
  ['node', 'Node.js'],
  ['nodejs', 'Node.js'],
  ['express', 'Express.js'],
  ['expressjs', 'Express.js'],
  ['reactjs', 'React'],
  ['nextjs', 'Next.js'],
  ['vuejs', 'Vue.js'],
  ['springboot', 'Spring Boot'],

  // --- Data ---
  ['postgres', 'PostgreSQL'],
  ['psql', 'PostgreSQL'],
  ['mongo', 'MongoDB'],
  ['mysqldb', 'MySQL'],

  // --- Platform ---
  ['amazonwebservices', 'AWS'],
  ['gcp', 'Google Cloud'],
  ['googlecloudplatform', 'Google Cloud'],
  ['k8s', 'Kubernetes'],
  ['cicd', 'CI/CD'],
  ['restapi', 'REST APIs'],
  ['rest', 'REST APIs'],
  ['restfulapis', 'REST APIs'],

  // --- Practice ---
  ['dsa', 'Data Structures and Algorithms'],
  ['datastructures', 'Data Structures and Algorithms'],
  ['ml', 'Machine Learning'],
  ['ai', 'Artificial Intelligence'],
  ['oop', 'Object-Oriented Programming'],
  ['oops', 'Object-Oriented Programming'],
]);

/** Normalised alias keys, so a canonical name is recognised as its own alias. */
const CANONICAL_KEYS = new Map(
  [...new Set(ALIASES.values())].map((name) => [normalise(name), name]),
);

/**
 * Strips everything that is spelling rather than meaning.
 *
 * `+` and `#` survive, because dropping them would make "C++", "C#" and "C"
 * the same skill — three different answers to "can you write this?".
 */
function normalise(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, '');
}

/**
 * The comparison key for a skill name.
 *
 * Every comparison between skills from different sources goes through this.
 *
 * @param {string} name
 * @returns {string} Empty string when the name has no usable content, which
 *   the caller must treat as "not a skill" rather than as a key.
 */
export function skillKey(name) {
  const normalised = normalise(name);
  if (normalised === '') return '';

  const alias = ALIASES.get(normalised);
  return alias ? normalise(alias) : normalised;
}

/**
 * The name to show for a skill.
 *
 * Returns the canonical spelling when one is known, and otherwise the
 * student's own words, trimmed. Deliberately not title-cased: a guess at
 * capitalisation turns "iOS" into "Ios" and "npm" into "Npm", which reads as
 * though Nexora does not know the field.
 *
 * @param {string} name
 * @returns {string}
 */
export function skillDisplayName(name) {
  const normalised = normalise(name);

  return ALIASES.get(normalised) ?? CANONICAL_KEYS.get(normalised) ?? String(name ?? '').trim();
}

/**
 * Whether two skill names refer to the same skill.
 *
 * Empty names never match — including each other. "No skill" is not a skill
 * two sources can agree on.
 */
export function isSameSkill(left, right) {
  const key = skillKey(left);
  return key !== '' && key === skillKey(right);
}

/**
 * Every skill name Nexora recognises by its canonical spelling.
 *
 * Used where something has to be checked *against* a vocabulary rather than
 * merely normalised — notably confirming that an AI-written summary has not
 * credited a student with a skill they do not have.
 *
 * Deliberately not a complete taxonomy of technology, and it does not try to
 * be. It is the set of names this module can speak about with confidence.
 * Career roles contribute the rest of the vocabulary once a catalogue exists.
 *
 * @returns {string[]}
 */
export function knownSkillNames() {
  return [...CANONICAL_KEYS.values()];
}

/**
 * Collapses a list of skill names to one entry per distinct skill.
 *
 * Keeps the first occurrence's position, which matters where the caller has
 * already ordered the list by something meaningful.
 *
 * @param {string[]} names
 * @returns {{ key: string, name: string }[]}
 */
export function uniqueSkills(names) {
  const seen = new Map();

  for (const name of names) {
    const key = skillKey(name);
    if (key === '' || seen.has(key)) continue;

    seen.set(key, { key, name: skillDisplayName(name) });
  }

  return [...seen.values()];
}
