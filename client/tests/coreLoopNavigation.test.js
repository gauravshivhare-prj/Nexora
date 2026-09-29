import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../src');

describe('P23 — Core-Loop Navigation & Complete Graph Parity', () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(CLIENT_DIR, relPath), 'utf8');

  describe('1. Global Destinations and Top-Level Routing', () => {
    it('AppNav defines all 8 core destinations with min 44px touch targets', () => {
      const appNav = readSrc('components/AppNav.jsx');
      const expectedDestinations = [
        '/app',
        '/profile',
        '/resume',
        '/career-twin',
        '/assessments',
        '/interviews',
        '/careers',
        '/opportunities',
      ];

      for (const dest of expectedDestinations) {
        assert.ok(
          appNav.includes(`to: '${dest}'`),
          `AppNav missing destination ${dest}`,
        );
      }
    });

    it('AppRoutes defines protected routes for all destinations', () => {
      const appRoutes = readSrc('routes/AppRoutes.jsx');
      const expectedPaths = [
        'path="/app"',
        'path="/profile"',
        'path="/resume"',
        'path="/career-twin"',
        'path="/assessments"',
        'path="/interviews"',
        'path="/careers"',
        'path="/opportunities"',
        'path="/careers/:roleId/skill-gap"',
        'path="/careers/:roleId/roadmap"',
      ];

      for (const p of expectedPaths) {
        assert.ok(appRoutes.includes(p), `AppRoutes missing route ${p}`);
      }
    });
  });

  describe('2. Core-Loop Forward and Backward Continuity', () => {
    it('Profile page links forward to resume and career-twin', () => {
      const profile = readSrc('pages/ProfilePage.jsx');
      assert.ok(profile.includes('to="/resume"'), 'Profile must link to /resume');
      assert.ok(profile.includes('to="/career-twin"'), 'Profile must link to /career-twin');
    });

    it('CareerTwin links forward to careers, assessments, and opportunities', () => {
      const twin = readSrc('pages/CareerTwinPage.jsx');
      assert.ok(twin.includes('to="/careers"'), 'CareerTwin must link to /careers');
      assert.ok(twin.includes('to="/assessments"'), 'CareerTwin must link to /assessments');
      assert.ok(twin.includes('to="/opportunities"'), 'CareerTwin must link to /opportunities');
    });

    it('Skill Gap links forward to roadmap and assessments, and back to careers', () => {
      const gap = readSrc('pages/SkillGapPage.jsx');
      assert.ok(gap.includes('to={`/careers/${gap.roleId}/roadmap`}'), 'SkillGap must link to roadmap');
      assert.ok(gap.includes('to="/assessments"'), 'SkillGap must link to assessments');
      assert.ok(gap.includes('to="/careers"'), 'SkillGap must link back to careers');
    });

    it('Roadmap links to profile, assessments, interviews, and back to skill-gap', () => {
      const roadmap = readSrc('pages/RoadmapPage.jsx');
      assert.ok(roadmap.includes('to="/profile"'), 'Roadmap must link to profile');
      assert.ok(roadmap.includes('to="/assessments"'), 'Roadmap must link to assessments');
      assert.ok(roadmap.includes('to="/interviews"'), 'Roadmap must link to interviews');
      assert.ok(
        roadmap.includes('to={`/careers/${roadmap.goal.roleId}/skill-gap`}'),
        'Roadmap must link back to skill gap',
      );
    });

    it('Assessment results link forward to career-twin, opportunities, interviews, and catalog', () => {
      const assessmentRunner = readSrc('pages/AssessmentRunnerPage.jsx');
      assert.ok(assessmentRunner.includes('to="/career-twin"'), 'Assessment runner must link to /career-twin');
      assert.ok(assessmentRunner.includes('to="/opportunities"'), 'Assessment runner must link to /opportunities');
      assert.ok(assessmentRunner.includes('to="/interviews"'), 'Assessment runner must link to /interviews');
      assert.ok(assessmentRunner.includes('to="/assessments"'), 'Assessment runner must link to /assessments');
    });

    it('Interview results link forward to opportunities, career-twin, and interview list', () => {
      const interviewSession = readSrc('pages/InterviewSessionPage.jsx');
      assert.ok(interviewSession.includes('to="/opportunities"'), 'Interview session must link to /opportunities');
      assert.ok(interviewSession.includes('to="/career-twin"'), 'Interview session must link to /career-twin');
      assert.ok(interviewSession.includes('to="/interviews"'), 'Interview session must link to /interviews');
    });

    it('Readiness visualization links to skill-gap, roadmap, assessments, and opportunities', () => {
      const readiness = readSrc('components/ReadinessVisualization.jsx');
      assert.ok(readiness.includes('to={`/careers/${role.roleId}/skill-gap`}'), 'Readiness must link to skill gap');
      assert.ok(readiness.includes('to={`/careers/${role.roleId}/roadmap`}'), 'Readiness must link to roadmap');
      assert.ok(readiness.includes('to="/assessments"'), 'Readiness must link to assessments');
      assert.ok(readiness.includes('to="/opportunities"'), 'Readiness must link to opportunities');
    });

    it('Opportunities page provides CTAs to assessments, interviews, profile, and careers', () => {
      const opps = readSrc('pages/OpportunitiesPage.jsx');
      assert.ok(opps.includes('to="/assessments"'), 'Opportunities must link to /assessments');
      assert.ok(opps.includes('to="/interviews"'), 'Opportunities must link to /interviews');
      assert.ok(opps.includes('to="/profile"'), 'Opportunities must link to /profile');
      assert.ok(opps.includes('to="/careers"'), 'Opportunities must link to /careers');
    });
  });

  describe('3. Return Paths & Breadcrumbs to Dashboard', () => {
    it('PageHeader defaults backTo to /app', () => {
      const pageShell = readSrc('components/PageShell.jsx');
      assert.ok(
        pageShell.includes("backTo = '/app'"),
        'PageHeader default backTo must be /app',
      );
    });
  });
});
