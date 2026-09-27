import { skillKey } from '../../src/domain/skills/skillKey.js';

function defaultSourceForStrength(strength) {
  if (strength === 'verified') return 'interview';
  if (strength === 'supported') return 'project';
  return 'self_declared';
}

function skill(name, strength = 'claimed', customSource = null) {
  const source = customSource || defaultSourceForStrength(strength);
  return {
    key: skillKey(name),
    name,
    strength,
    sourceCount: strength === 'verified' ? 3 : strength === 'supported' ? 2 : 1,
    evidence: [
      {
        source,
        strength,
        detail: `${strength} evidence for ${name}`,
        reference: null,
      },
    ],
  };
}

function twin(skills = [], extras = {}) {
  return {
    skills: skills.map((item) => (typeof item === 'string' ? skill(item) : skill(item.name, item.strength, item.source))),
    interests: [],
    targetRoles: [],
    academic: null,
    ...extras,
  };
}

export const RECOMMENDATION_FIXTURES = {
  // Empty baseline
  emptyProfile: twin(),

  // Role 1: Backend Developer
  strongBackendFit: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
      { name: 'Express.js', strength: 'supported' },
      { name: 'MongoDB', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      academic: { branch: 'Computer Science and Engineering' },
    },
  ),

  // Role 2: Frontend Developer
  strongFrontendFit: twin(
    [
      { name: 'HTML', strength: 'supported' },
      { name: 'CSS', strength: 'supported' },
      { name: 'JavaScript', strength: 'supported' },
      { name: 'React', strength: 'supported' },
      { name: 'TypeScript', strength: 'supported' },
      { name: 'Next.js', strength: 'supported' },
      { name: 'Tailwind CSS', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Frontend Developer', origin: 'student' }],
      academic: { branch: 'Computer Science and Engineering' },
    },
  ),

  // Role 3: Full Stack Developer
  strongFullStackFit: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'React', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
      { name: 'TypeScript', strength: 'supported' },
      { name: 'Express.js', strength: 'supported' },
      { name: 'MongoDB', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Full Stack Developer', origin: 'student' }],
      academic: { branch: 'Information Technology' },
    },
  ),

  // Role 4: Data Analyst
  strongDataAnalystFit: twin(
    [
      { name: 'SQL', strength: 'supported' },
      { name: 'Excel', strength: 'supported' },
      { name: 'Data Visualisation', strength: 'supported' },
      { name: 'Python', strength: 'supported' },
      { name: 'Power BI', strength: 'supported' },
      { name: 'Tableau', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Data Analyst', origin: 'student' }],
      academic: { branch: 'Statistics' },
    },
  ),

  // Role 5: Data Scientist
  strongDataScientistFit: twin(
    [
      { name: 'Python', strength: 'supported' },
      { name: 'Statistics', strength: 'supported' },
      { name: 'Machine Learning', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
      { name: 'Pandas', strength: 'supported' },
      { name: 'NumPy', strength: 'supported' },
      { name: 'scikit-learn', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Data Scientist', origin: 'student' }],
      academic: { branch: 'Mathematics' },
    },
  ),

  // Role 6: DevOps Engineer
  strongDevOpsFit: twin(
    [
      { name: 'Linux', strength: 'supported' },
      { name: 'Docker', strength: 'supported' },
      { name: 'CI/CD', strength: 'supported' },
      { name: 'Git', strength: 'supported' },
      { name: 'Kubernetes', strength: 'supported' },
      { name: 'AWS', strength: 'supported' },
      { name: 'Terraform', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'DevOps Engineer', origin: 'student' }],
      academic: { branch: 'Software Engineering' },
    },
  ),

  // Role 7: Mobile Application Developer
  strongMobileFit: twin(
    [
      { name: 'Mobile Development', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'React Native', strength: 'supported' },
      { name: 'Kotlin', strength: 'supported' },
      { name: 'Swift', strength: 'supported' },
      { name: 'Git', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Mobile Application Developer', origin: 'student' }],
      academic: { branch: 'Computer Engineering' },
    },
  ),

  // Role 8: QA / Test Engineer
  strongQAEngineerFit: twin(
    [
      { name: 'Testing', strength: 'supported' },
      { name: 'Test Automation', strength: 'supported' },
      { name: 'Selenium', strength: 'supported' },
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Python', strength: 'supported' },
      { name: 'CI/CD', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'QA / Test Engineer', origin: 'student' }],
      academic: { branch: 'Computer Science' },
    },
  ),

  // Role 9: UI/UX Designer
  strongUIUXFit: twin(
    [
      { name: 'UI Design', strength: 'supported' },
      { name: 'UX Research', strength: 'supported' },
      { name: 'Figma', strength: 'supported' },
      { name: 'Prototyping', strength: 'supported' },
      { name: 'Accessibility', strength: 'supported' },
      { name: 'Design Systems', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'UI/UX Designer', origin: 'student' }],
      academic: { branch: 'Design' },
    },
  ),

  // Role 10: Cloud Engineer
  strongCloudFit: twin(
    [
      { name: 'Cloud Computing', strength: 'supported' },
      { name: 'Linux', strength: 'supported' },
      { name: 'Networking', strength: 'supported' },
      { name: 'AWS', strength: 'supported' },
      { name: 'Docker', strength: 'supported' },
      { name: 'Kubernetes', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Cloud Engineer', origin: 'student' }],
      academic: { branch: 'Computer Science and Engineering' },
    },
  ),

  // Evidence tiers for exact credit progression tests
  claimedBackendSkills: twin(['JavaScript', 'Node.js', 'REST APIs', 'SQL']),
  supportedBackendSkills: twin([
    { name: 'JavaScript', strength: 'supported' },
    { name: 'Node.js', strength: 'supported' },
    { name: 'REST APIs', strength: 'supported' },
    { name: 'SQL', strength: 'supported' },
  ]),
  verifiedBackendSkills: twin([
    { name: 'JavaScript', strength: 'verified' },
    { name: 'Node.js', strength: 'verified' },
    { name: 'REST APIs', strength: 'verified' },
    { name: 'SQL', strength: 'verified' },
  ]),
  mixedEvidenceBackendSkills: twin([
    { name: 'JavaScript', strength: 'verified' },
    { name: 'Node.js', strength: 'supported' },
    { name: 'REST APIs', strength: 'claimed' },
    { name: 'SQL', strength: 'claimed' },
  ]),

  // Normalization and alignment edge cases
  conflictingInterestAndSkills: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Frontend Developer', origin: 'student' }],
      interests: ['UI Design'],
    },
  ),

  unrelatedAcademicFit: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      academic: { branch: 'Civil Engineering' },
    },
  ),

  neutralAcademicFit: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      academic: null,
    },
  ),

  genericTitleStudentTarget: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Senior Software Application Developer', origin: 'student' }],
    },
  ),

  casingAndPunctuationSkills: twin(
    [
      { name: 'node.js', strength: 'supported' },
      { name: 'sql', strength: 'supported' },
      { name: 'rest apis', strength: 'supported' },
      { name: 'javascript', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
    },
  ),

  // Boundary score fixtures
  belowThresholdCandidate: twin([{ name: 'Terraform', strength: 'claimed' }]),
  aboveThresholdCandidate: twin(
    [{ name: 'JavaScript', strength: 'supported' }],
    { academic: { branch: 'Computer Science' } },
  ),
};