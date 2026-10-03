import { canonicalSkill } from '../../src/domain/skills/skillKey.js';

/**
 * Deeply freezes an object recursively to ensure fixture immutability.
 */
function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Ensures synthetic student personas are never evaluated in production environments.
 */
export function assertNonProductionEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Synthetic student personas are strictly for automated testing and MUST NEVER be loaded in production.',
    );
  }
}

export const STUDENT_PERSONA_METADATA = deepFreeze({
  isSynthetic: true,
  purpose: 'persona_journey_simulation',
  environment: 'test',
  productionUsable: false,
  version: 1,
});

export const STUDENT_PERSONAS = deepFreeze({
  // 1. CS Sophomore: Solid CS foundation, sophomore year, backend focus
  csSophomore: {
    id: 'synthetic-cs-sophomore',
    key: 'csSophomore',
    metadata: STUDENT_PERSONA_METADATA,
    name: 'Aarav Sharma',
    emailPrefix: 'aarav.sophomore',
    profile: {
      personal: {
        phone: '9876543210',
        dateOfBirth: '2005-04-12',
        gender: 'male',
        city: 'Bangalore',
        state: 'Karnataka',
      },
      academic: {
        collegeName: 'National Institute of Technology Karnataka',
        degree: 'B.Tech',
        branch: 'Computer Science and Engineering',
        currentSemester: 4,
        graduationYear: 2027,
        cgpa: 8.6,
      },
      career: {
        targetRole: 'Backend Developer',
        preferredLocation: 'Bangalore',
        careerInterests: ['Backend Development', 'Distributed Systems'],
        bio: 'CS sophomore passionate about scalable web servers and data structures.',
      },
      skills: [
        { name: 'Node.js', level: 'intermediate' },
        { name: 'Python', level: 'intermediate' },
        { name: 'Data Structures', level: 'intermediate' },
        { name: 'SQL', level: 'beginner' },
        { name: 'Git', level: 'intermediate' },
      ],
      projects: [
        {
          title: 'Campus Food Delivery API',
          description: 'RESTful API with Node.js and SQLite for hostel mess ordering',
          technologies: ['Node.js', 'SQL'],
        },
      ],
    },
    resumeText: `
Aarav Sharma
Computer Science Undergraduate | NITK Surathkal
Email: aarav.sophomore@example.com

SKILLS:
- Languages & Frameworks: Node.js, Express, Python, SQL, C++
- Core Competencies: Data Structures, Algorithms, REST APIs, Git

PROJECTS:
Campus Food Delivery API
- Architected REST endpoints using Node.js and Express handling campus cafeteria orders.
- Designed relational schemas in SQL for user authentication and transaction records.

Distributed Log Collector
- Built a multi-threaded Python log scraper supporting regex filtering and local JSON export.
`,
    targetRole: 'Backend Developer',
    expectedReadinessRange: { min: 35, max: 70 },
    expectedTopRoles: ['Backend Developer', 'Software Engineer'],
  },

  // 2. Career Changer: Non-technical degree (Humanities), self-taught frontend
  careerChanger: {
    id: 'synthetic-career-changer',
    key: 'careerChanger',
    metadata: STUDENT_PERSONA_METADATA,
    name: 'Priya Nair',
    emailPrefix: 'priya.changer',
    profile: {
      personal: {
        phone: '9876543211',
        dateOfBirth: '1999-08-20',
        gender: 'female',
        city: 'Kochi',
        state: 'Kerala',
      },
      academic: {
        collegeName: 'University College',
        degree: 'B.A.',
        branch: 'English Literature',
        currentSemester: 6,
        graduationYear: 2021,
        cgpa: 7.8,
      },
      career: {
        targetRole: 'Frontend Developer',
        preferredLocation: 'Remote',
        careerInterests: ['Frontend Development', 'Web Design'],
        bio: 'Self-taught web developer transitioning from publishing into frontend engineering.',
      },
      skills: [
        { name: 'HTML', level: 'intermediate' },
        { name: 'CSS', level: 'intermediate' },
        { name: 'JavaScript', level: 'beginner' },
      ],
      projects: [
        {
          title: 'Literary Journal Landing Page',
          description: 'Responsive web page using HTML5 and CSS Grid',
          technologies: ['HTML', 'CSS'],
        },
      ],
    },
    resumeText: `
Priya Nair
Self-Taught Frontend Web Developer
Email: priya.changer@example.com

SUMMARY:
Transitioning professional with strong visual design sense and fundamental web skills.

TECHNICAL SKILLS:
- Web: HTML5, CSS3, Flexbox, Grid, Responsive Design
- Scripting: Basic JavaScript (ES6), DOM manipulation

PROJECTS:
Literary Journal Showcase
- Designed a mobile-first responsive portfolio site using semantic HTML5 and vanilla CSS.
- Implemented accessible layout, high contrast color scheme, and fluid typography.
`,
    targetRole: 'Frontend Developer',
    expectedReadinessRange: { min: 15, max: 55 },
    expectedTopRoles: ['Frontend Developer'],
  },

  // 3. Experienced Developer / Senior Student: High skills, internship, verified evidence
  experiencedDev: {
    id: 'synthetic-experienced-dev',
    key: 'experiencedDev',
    metadata: STUDENT_PERSONA_METADATA,
    name: 'Rohan Varma',
    emailPrefix: 'rohan.experienced',
    profile: {
      personal: {
        phone: '9876543212',
        dateOfBirth: '2003-01-18',
        gender: 'male',
        city: 'Hyderabad',
        state: 'Telangana',
      },
      academic: {
        collegeName: 'International Institute of Information Technology',
        degree: 'B.Tech',
        branch: 'Computer Science and Engineering',
        currentSemester: 8,
        graduationYear: 2025,
        cgpa: 9.3,
      },
      career: {
        targetRole: 'Full Stack Developer',
        preferredLocation: 'Hyderabad',
        careerInterests: ['Full Stack Development', 'Cloud Computing', 'DevOps'],
        bio: 'Final year CSE undergraduate with two software engineering internships.',
      },
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
        { name: 'React', level: 'advanced' },
        { name: 'Docker', level: 'intermediate' },
        { name: 'MongoDB', level: 'advanced' },
        { name: 'TypeScript', level: 'intermediate' },
        { name: 'Git', level: 'advanced' },
        { name: 'SQL', level: 'intermediate' },
      ],
      projects: [
        {
          title: 'Real-Time Collaborative Code Sandbox',
          description: 'WebSockets microservice cluster with React frontend and Docker sandbox',
          technologies: ['React', 'Node.js', 'Docker', 'MongoDB'],
        },
      ],
    },
    resumeText: `
Rohan Varma
Full Stack Software Engineer | IIIT Hyderabad
Email: rohan.experienced@example.com

EDUCATION:
B.Tech in Computer Science, IIIT Hyderabad, CGPA: 9.3/10.0 (Graduating 2025)

EXPERIENCE:
Software Engineering Intern - CloudScale Technologies (Summer 2024)
- Developed resilient Node.js microservices with Redis caching, reducing API p95 latency by 32%.
- Contributed to React design system components used by 100k+ active users.

SKILLS:
- Languages & Frameworks: JavaScript, TypeScript, Node.js, Express, React, SQL, MongoDB
- Cloud & Tools: Docker, Kubernetes, Git, CI/CD pipelines, Jest

PROJECTS:
Collaborative Code Sandbox
- Implemented real-time synchronization using WebSockets and conflict-free replicated data types.
- Containerized code runner sandboxes using Docker with CPU/memory resource isolation.
`,
    targetRole: 'Full Stack Developer',
    expectedReadinessRange: { min: 65, max: 100 },
    expectedTopRoles: ['Full Stack Developer', 'Backend Developer', 'Software Engineer'],
  },

  // 4. Minimal Profile: Cold-start, newly registered, no resume or skills yet
  minimalProfile: {
    id: 'synthetic-minimal-profile',
    key: 'minimalProfile',
    metadata: STUDENT_PERSONA_METADATA,
    name: 'Devanshi Patel',
    emailPrefix: 'devanshi.minimal',
    profile: {
      personal: {
        phone: '9876543213',
        dateOfBirth: '2006-11-05',
        gender: 'female',
        city: 'Ahmedabad',
        state: 'Gujarat',
      },
      academic: {
        collegeName: 'State Engineering College',
        degree: 'B.Tech',
        branch: 'Information Technology',
        currentSemester: 1,
        graduationYear: 2029,
        cgpa: 0,
      },
      career: {
        targetRole: '',
        preferredLocation: 'Ahmedabad',
        careerInterests: [],
        bio: '',
      },
      skills: [],
      projects: [],
    },
    resumeText: '',
    targetRole: '',
    expectedReadinessRange: { min: 0, max: 25 },
    expectedTopRoles: [],
  },
});

/**
 * Helper to fetch a persona with verification.
 */
export function getStudentPersona(key) {
  assertNonProductionEnvironment();
  const persona = STUDENT_PERSONAS[key];
  if (!persona) {
    throw new Error(`Unknown student persona: "${key}". Available: ${Object.keys(STUDENT_PERSONAS).join(', ')}`);
  }
  return persona;
}
