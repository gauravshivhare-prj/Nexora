/**
 * The career roles Nexora can match a student against.
 *
 * ## What this is, and is not
 *
 * This is a **curated internal reference list**, written by hand. It is not
 * derived from a job-board scrape, a labour-market dataset or a survey, and
 * nothing here is presented as a market statistic. There are no salary
 * figures, no demand or growth numbers and no hiring rates, because Nexora
 * has no verified source for any of them and inventing them would be the
 * most damaging kind of fabrication — a student making a career decision on
 * a number somebody made up.
 *
 * What it does contain is a defensible answer to one narrow question: "which
 * skills does this kind of role usually involve?" That is ordinary domain
 * knowledge, it is checkable by anyone who reads it, and it is versioned so
 * a recommendation can be traced to the catalogue that produced it.
 *
 * ## Required vs preferred
 *
 * `required` means a role is not really that role without it. A backend
 * developer who cannot write a server-side language is not a backend
 * developer. Keep these lists short — every entry a student lacks becomes a
 * gap, and a required list of fifteen items makes every student look
 * unqualified for everything.
 *
 * `preferred` is what strengthens a candidacy without being fundamental.
 * Missing several preferred skills is normal and should not read as failure.
 *
 * ## Adding a role
 *
 * Give it required skills a practitioner would agree are non-negotiable,
 * preferred skills that are genuinely common, and a background that reflects
 * who actually does the job. Bump `CATALOGUE_VERSION` when any role changes,
 * so stored recommendations can be recognised as computed against an older
 * list rather than silently compared across versions.
 */

/**
 * Version of this catalogue.
 *
 * Stored on every recommendation. Increment on any change to the roles below.
 */
export const CATALOGUE_VERSION = 1;

/** Where the content came from, recorded honestly on every recommendation. */
export const CATALOGUE_SOURCE = {
  type: 'curated',
  description:
    'Hand-written internal reference list of common entry-level technology roles. Not derived from job-market data; contains no salary, demand or hiring statistics.',
  version: CATALOGUE_VERSION,
};

export const ROLE_CATEGORIES = {
  ENGINEERING: 'engineering',
  DATA: 'data',
  INFRASTRUCTURE: 'infrastructure',
  DESIGN: 'design',
  QUALITY: 'quality',
};

/**
 * Academic backgrounds a role commonly draws from.
 *
 * Used as a weak positive signal only. A student from another background is
 * never penalised or excluded — people move into all of these roles from
 * everywhere, and a matcher that assumed otherwise would be both wrong and
 * discriminatory. Matching on the absence of this signal is explicitly not
 * done; see scoreRoleMatch.
 */
const COMPUTING_BACKGROUNDS = [
  'computer science',
  'computer science and engineering',
  'information technology',
  'software engineering',
  'computer engineering',
];

/**
 * @typedef {object} CareerRole
 * @property {string} id Stable key. Never reuse or repurpose one.
 * @property {string} title
 * @property {string} category
 * @property {string} summary What the job actually involves, in one line.
 * @property {string[]} requiredSkills Not that role without these.
 * @property {string[]} preferredSkills Strengthens a candidacy.
 * @property {string[]} relatedTechnologies Commonly encountered; not scored.
 * @property {string[]} commonBackgrounds Weak positive signal only.
 */

/** @type {CareerRole[]} */
export const CAREER_ROLES = [
  {
    id: 'backend-developer',
    title: 'Backend Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds the server-side logic, APIs and data access behind an application.',
    requiredSkills: ['JavaScript', 'Node.js', 'REST APIs', 'SQL'],
    preferredSkills: ['Express.js', 'MongoDB', 'PostgreSQL', 'Docker', 'Redis', 'Git'],
    relatedTechnologies: ['Nginx', 'GraphQL', 'RabbitMQ', 'Kubernetes'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds the interface users interact with, in the browser.',
    requiredSkills: ['HTML', 'CSS', 'JavaScript', 'React'],
    preferredSkills: ['TypeScript', 'Next.js', 'Tailwind CSS', 'Git', 'Accessibility'],
    relatedTechnologies: ['Vue.js', 'Webpack', 'Vite', 'Figma'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'full-stack-developer',
    title: 'Full Stack Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Works across both the interface and the server side of an application.',
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'SQL'],
    preferredSkills: ['TypeScript', 'Express.js', 'MongoDB', 'REST APIs', 'Git', 'Docker'],
    relatedTechnologies: ['Next.js', 'GraphQL', 'AWS'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'data-analyst',
    title: 'Data Analyst',
    category: ROLE_CATEGORIES.DATA,
    summary: 'Turns data into answers that someone can act on.',
    requiredSkills: ['SQL', 'Excel', 'Data Visualisation'],
    preferredSkills: ['Python', 'Power BI', 'Tableau', 'Statistics'],
    relatedTechnologies: ['Pandas', 'Looker', 'BigQuery'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'statistics', 'mathematics', 'economics'],
  },
  {
    id: 'data-scientist',
    title: 'Data Scientist',
    category: ROLE_CATEGORIES.DATA,
    summary: 'Builds statistical and machine-learning models to answer harder questions.',
    requiredSkills: ['Python', 'Statistics', 'Machine Learning', 'SQL'],
    preferredSkills: ['Pandas', 'NumPy', 'scikit-learn', 'Data Visualisation', 'Deep Learning'],
    relatedTechnologies: ['TensorFlow', 'PyTorch', 'Jupyter'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'statistics', 'mathematics'],
  },
  {
    id: 'devops-engineer',
    title: 'DevOps Engineer',
    category: ROLE_CATEGORIES.INFRASTRUCTURE,
    summary: 'Builds and runs the systems that ship and operate software.',
    requiredSkills: ['Linux', 'Docker', 'CI/CD', 'Git'],
    preferredSkills: ['Kubernetes', 'AWS', 'Terraform', 'Bash', 'Python'],
    relatedTechnologies: ['Jenkins', 'Prometheus', 'Ansible'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'mobile-developer',
    title: 'Mobile Application Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds applications that run on phones and tablets.',
    requiredSkills: ['Mobile Development', 'REST APIs'],
    preferredSkills: ['React Native', 'Flutter', 'Kotlin', 'Swift', 'Git'],
    relatedTechnologies: ['Firebase', 'Android Studio', 'Xcode'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'qa-engineer',
    title: 'QA / Test Engineer',
    category: ROLE_CATEGORIES.QUALITY,
    summary: 'Finds out whether software actually works, and automates the finding out.',
    requiredSkills: ['Testing', 'Test Automation'],
    preferredSkills: ['Selenium', 'JavaScript', 'Python', 'CI/CD', 'SQL'],
    relatedTechnologies: ['Cypress', 'Playwright', 'JUnit', 'Postman'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
  {
    id: 'ui-ux-designer',
    title: 'UI/UX Designer',
    category: ROLE_CATEGORIES.DESIGN,
    summary: 'Designs how a product looks and how it is used.',
    requiredSkills: ['UI Design', 'UX Research', 'Figma'],
    preferredSkills: ['Prototyping', 'Accessibility', 'Design Systems', 'HTML', 'CSS'],
    relatedTechnologies: ['Adobe XD', 'Sketch', 'Framer'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'design', 'human-computer interaction'],
  },
  {
    id: 'cloud-engineer',
    title: 'Cloud Engineer',
    category: ROLE_CATEGORIES.INFRASTRUCTURE,
    summary: 'Designs and runs systems on cloud platforms.',
    requiredSkills: ['Cloud Computing', 'Linux', 'Networking'],
    preferredSkills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'Python'],
    relatedTechnologies: ['Google Cloud', 'Azure', 'CloudFormation'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
  },
];

/** Looks one role up by id. */
export function findRole(roleId) {
  return CAREER_ROLES.find((role) => role.id === roleId) ?? null;
}

/**
 * Every skill name the catalogue mentions.
 *
 * This is Nexora's working skill vocabulary, and the set an AI-written
 * summary is checked against.
 */
export function catalogueSkillNames() {
  return [
    ...new Set(
      CAREER_ROLES.flatMap((role) => [
        ...role.requiredSkills,
        ...role.preferredSkills,
        ...role.relatedTechnologies,
      ]),
    ),
  ];
}
