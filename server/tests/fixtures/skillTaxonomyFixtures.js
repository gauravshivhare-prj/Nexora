/**
 * Regression fixtures for canonical skill taxonomy, alias mappings,
 * and normalization boundaries.
 */

export const ALIAS_REGRESSION_FIXTURES = Object.freeze([
  // Core Web & Languages
  { input: 'HTML5', expectedKey: 'html', expectedName: 'HTML', category: 'web' },
  { input: 'html 5', expectedKey: 'html', expectedName: 'HTML', category: 'web' },
  { input: 'CSS3', expectedKey: 'css', expectedName: 'CSS', category: 'web' },
  { input: 'css 3', expectedKey: 'css', expectedName: 'CSS', category: 'web' },
  { input: 'JS', expectedKey: 'javascript', expectedName: 'JavaScript', category: 'languages' },
  { input: 'ecmascript', expectedKey: 'javascript', expectedName: 'JavaScript', category: 'languages' },
  { input: 'TS', expectedKey: 'typescript', expectedName: 'TypeScript', category: 'languages' },
  { input: 'py', expectedKey: 'python', expectedName: 'Python', category: 'languages' },
  { input: 'python3', expectedKey: 'python', expectedName: 'Python', category: 'languages' },
  { input: 'golang', expectedKey: 'go', expectedName: 'Go', category: 'languages' },
  { input: 'cpp', expectedKey: 'c++', expectedName: 'C++', category: 'languages' },
  { input: 'cplusplus', expectedKey: 'c++', expectedName: 'C++', category: 'languages' },
  { input: 'csharp', expectedKey: 'c#', expectedName: 'C#', category: 'languages' },
  { input: 'c sharp', expectedKey: 'c#', expectedName: 'C#', category: 'languages' },
  { input: 'dotnet', expectedKey: 'net', expectedName: '.NET', category: 'languages' },
  { input: '.NET', expectedKey: 'net', expectedName: '.NET', category: 'languages' },
  { input: 'Structured Query Language', expectedKey: 'sql', expectedName: 'SQL', category: 'data' },

  // Runtimes and Frameworks
  { input: 'node', expectedKey: 'nodejs', expectedName: 'Node.js', category: 'frameworks' },
  { input: 'nodejs', expectedKey: 'nodejs', expectedName: 'Node.js', category: 'frameworks' },
  { input: 'NODE.JS', expectedKey: 'nodejs', expectedName: 'Node.js', category: 'frameworks' },
  { input: 'node-js', expectedKey: 'nodejs', expectedName: 'Node.js', category: 'frameworks' },
  { input: 'express', expectedKey: 'expressjs', expectedName: 'Express.js', category: 'frameworks' },
  { input: 'expressjs', expectedKey: 'expressjs', expectedName: 'Express.js', category: 'frameworks' },
  { input: 'reactjs', expectedKey: 'react', expectedName: 'React', category: 'frameworks' },
  { input: 'nextjs', expectedKey: 'nextjs', expectedName: 'Next.js', category: 'frameworks' },
  { input: 'vue', expectedKey: 'vuejs', expectedName: 'Vue.js', category: 'frameworks' },
  { input: 'vuejs', expectedKey: 'vuejs', expectedName: 'Vue.js', category: 'frameworks' },
  { input: 'springboot', expectedKey: 'springboot', expectedName: 'Spring Boot', category: 'frameworks' },
  { input: 'tailwind', expectedKey: 'tailwindcss', expectedName: 'Tailwind CSS', category: 'frameworks' },
  { input: 'scikitlearn', expectedKey: 'scikitlearn', expectedName: 'scikit-learn', category: 'ml' },
  { input: 'sklearn', expectedKey: 'scikitlearn', expectedName: 'scikit-learn', category: 'ml' },

  // Data & Analytics
  { input: 'postgres', expectedKey: 'postgresql', expectedName: 'PostgreSQL', category: 'data' },
  { input: 'psql', expectedKey: 'postgresql', expectedName: 'PostgreSQL', category: 'data' },
  { input: 'postgresdb', expectedKey: 'postgresql', expectedName: 'PostgreSQL', category: 'data' },
  { input: 'mongo', expectedKey: 'mongodb', expectedName: 'MongoDB', category: 'data' },
  { input: 'mysqldb', expectedKey: 'mysql', expectedName: 'MySQL', category: 'data' },
  { input: 'Data Visualization', expectedKey: 'datavisualisation', expectedName: 'Data Visualisation', category: 'data' },
  { input: 'data visualization', expectedKey: 'datavisualisation', expectedName: 'Data Visualisation', category: 'data' },
  { input: 'dataanalytics', expectedKey: 'dataanalytics', expectedName: 'Data Analytics', category: 'data' },
  { input: 'powerbi', expectedKey: 'powerbi', expectedName: 'Power BI', category: 'data' },

  // Cloud & Infrastructure
  { input: 'amazonwebservices', expectedKey: 'aws', expectedName: 'AWS', category: 'cloud' },
  { input: 'Amazon AWS', expectedKey: 'aws', expectedName: 'AWS', category: 'cloud' },
  { input: 'amazonaws', expectedKey: 'aws', expectedName: 'AWS', category: 'cloud' },
  { input: 'Microsoft Azure', expectedKey: 'azure', expectedName: 'Azure', category: 'cloud' },
  { input: 'microsoftazure', expectedKey: 'azure', expectedName: 'Azure', category: 'cloud' },
  { input: 'gcp', expectedKey: 'googlecloud', expectedName: 'Google Cloud', category: 'cloud' },
  { input: 'googlecloudplatform', expectedKey: 'googlecloud', expectedName: 'Google Cloud', category: 'cloud' },
  { input: 'k8s', expectedKey: 'kubernetes', expectedName: 'Kubernetes', category: 'cloud' },
  { input: 'cicd', expectedKey: 'cicd', expectedName: 'CI/CD', category: 'cloud' },
  { input: 'restapi', expectedKey: 'restapis', expectedName: 'REST APIs', category: 'cloud' },
  { input: 'rest', expectedKey: 'restapis', expectedName: 'REST APIs', category: 'cloud' },
  { input: 'RESTful', expectedKey: 'restapis', expectedName: 'REST APIs', category: 'cloud' },
  { input: 'RESTful API', expectedKey: 'restapis', expectedName: 'REST APIs', category: 'cloud' },
  { input: 'restfulapis', expectedKey: 'restapis', expectedName: 'REST APIs', category: 'cloud' },
  { input: 'githubactions', expectedKey: 'githubactions', expectedName: 'GitHub Actions', category: 'cloud' },

  // Practice & Fundamentals
  { input: 'dsa', expectedKey: 'datastructuresandalgorithms', expectedName: 'Data Structures and Algorithms', category: 'practice' },
  { input: 'datastructures', expectedKey: 'datastructuresandalgorithms', expectedName: 'Data Structures and Algorithms', category: 'practice' },
  { input: 'Data Structures & Algorithms', expectedKey: 'datastructuresandalgorithms', expectedName: 'Data Structures and Algorithms', category: 'practice' },
  { input: 'datastructuresalgorithms', expectedKey: 'datastructuresandalgorithms', expectedName: 'Data Structures and Algorithms', category: 'practice' },
  { input: 'ml', expectedKey: 'machinelearning', expectedName: 'Machine Learning', category: 'practice' },
  { input: 'ai', expectedKey: 'artificialintelligence', expectedName: 'Artificial Intelligence', category: 'practice' },
  { input: 'oop', expectedKey: 'objectorientedprogramming', expectedName: 'Object-Oriented Programming', category: 'practice' },
  { input: 'oops', expectedKey: 'objectorientedprogramming', expectedName: 'Object-Oriented Programming', category: 'practice' },
  { input: 'Object-Oriented Programming', expectedKey: 'objectorientedprogramming', expectedName: 'Object-Oriented Programming', category: 'practice' },
]);

export const DISTINCT_SKILL_PAIRS = Object.freeze([
  ['React', 'React Native'],
  ['SQL', 'PostgreSQL'],
  ['Java', 'JavaScript'],
  ['Machine Learning', 'Deep Learning'],
  ['AWS', 'Azure'],
  ['Git', 'GitHub'],
  ['Docker', 'Docker Compose'],
  ['C', 'C++'],
  ['C', 'C#'],
  ['C++', 'C#'],
  ['Testing', 'Test Automation'],
  ['UI Design', 'UX Research'],
]);

export const INVALID_SKILL_INPUTS = Object.freeze(['', '   ', '---', '???', '!!!', null, undefined]);
