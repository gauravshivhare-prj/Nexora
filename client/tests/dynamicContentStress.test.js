import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../src');

describe('P27 — Dynamic Content Stress UI Audit Suite', () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(CLIENT_DIR, relPath), 'utf8');

  describe('1. Global Word Breaking and Flex Shrink Guards', () => {
    it('index.css declares overflow-wrap: anywhere to lower min-content on mobile', () => {
      const css = readSrc('index.css');
      assert.ok(css.includes('overflow-wrap: anywhere;'), 'body must declare overflow-wrap: anywhere');
    });

    it('SkillEvidence renders skill names with min-w-0 and break-words', () => {
      const skillEvidence = readSrc('components/careerTwin/SkillEvidence.jsx');
      assert.ok(
        skillEvidence.includes('min-w-0 break-words font-semibold text-ink'),
        'Skill name must have min-w-0 and break-words',
      );
    });
  });

  describe('2. Text Overflow and Scroll Guards on Unbounded Inputs', () => {
    it('InterviewSessionPage confines long candidate answers with scroll and wrap guards', () => {
      const session = readSrc('pages/InterviewSessionPage.jsx');
      assert.ok(
        session.includes('max-h-48 overflow-y-auto'),
        'Answer preview must have max-h-48 with overflow scroll',
      );
      assert.ok(
        session.includes('break-words whitespace-pre-wrap'),
        'Answer preview must preserve wrap without overflowing',
      );
      assert.ok(
        session.includes('min-h-[160px] max-h-[380px] overflow-y-auto break-words'),
        'Textarea draft must be guarded against infinite vertical growth',
      );
    });

    it('ResumeDetailPage confines raw extracted text with scroll guard', () => {
      const resumeDetail = readSrc('pages/ResumeDetailPage.jsx');
      assert.ok(
        resumeDetail.includes('max-h-96 overflow-auto'),
        'Raw resume text must have max-h-96 overflow-auto',
      );
      assert.ok(
        resumeDetail.includes('whitespace-pre-wrap break-all'),
        'Raw resume text must break long tokens',
      );
    });
  });

  describe('3. Dynamic List Items and Chip Wrapping', () => {
    it('OpportunitiesPage wraps title, summary, skills and roles gracefully', () => {
      const opps = readSrc('pages/OpportunitiesPage.jsx');
      assert.ok(opps.includes('line-clamp-2 leading-relaxed'), 'Summary must clamp to 2 lines');
      assert.ok(opps.includes('flex flex-wrap gap-1.5'), 'Skill chips must wrap');
    });

    it('CareersPage match card protects role titles and summaries against overflow', () => {
      const careers = readSrc('pages/CareersPage.jsx');
      assert.ok(careers.includes('text-base font-semibold text-ink break-words'), 'MatchCard title must break words');
      assert.ok(careers.includes('text-sm text-ink-muted break-words'), 'MatchCard summary must break words');
    });

    it('ResumePage protects long filenames and labels against blowout', () => {
      const resume = readSrc('pages/ResumePage.jsx');
      assert.ok(resume.includes('font-semibold text-ink break-words'), 'Resume label must break words');
      assert.ok(resume.includes('<span className="break-all">'), 'Resume file name must break-all');
    });
  });
});
