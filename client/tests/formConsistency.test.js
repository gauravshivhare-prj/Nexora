import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../src');

describe('P24 — Form Consistency & Accessibility Audit Suite', () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(CLIENT_DIR, relPath), 'utf8');

  describe('1. Shared Form Primitives & FieldShell Consistency', () => {
    it('FieldShell generates accessible labels and links errors with aria-describedby', () => {
      const fieldShell = readSrc('components/FieldShell.jsx');
      assert.ok(fieldShell.includes('useId()'), 'FieldShell must generate unique IDs');
      assert.ok(fieldShell.includes('htmlFor={id}'), 'FieldShell must associate label with control');
      assert.ok(fieldShell.includes('id={errorId}'), 'FieldShell must provide errorId');
      assert.ok(fieldShell.includes('describedBy = error ? errorId'), 'FieldShell must set describedBy to error');
    });

    it('FormField passes aria-invalid and aria-describedby to input', () => {
      const formField = readSrc('components/FormField.jsx');
      assert.ok(formField.includes("aria-invalid={invalid ? 'true' : undefined}"), 'FormField must set aria-invalid');
      assert.ok(formField.includes('aria-describedby={describedBy}'), 'FormField must pass aria-describedby');
    });

    it('SubmitButton sets aria-busy and disabled states when submitting', () => {
      const submitBtn = readSrc('components/SubmitButton.jsx');
      assert.ok(submitBtn.includes('disabled={isSubmitting'), 'SubmitButton must disable when submitting');
      assert.ok(submitBtn.includes('aria-busy={isSubmitting}'), 'SubmitButton must set aria-busy');
    });
  });

  describe('2. Authentication Forms Audit (Login & Register)', () => {
    it('LoginPage uses FormField, FormAlert, and SubmitButton with disabled state', () => {
      const login = readSrc('pages/LoginPage.jsx');
      assert.ok(login.includes('<FormField'), 'LoginPage must use FormField');
      assert.ok(login.includes('disabled={isSubmitting'), 'LoginPage fields must disable during submit');
      assert.ok(login.includes('<SubmitButton isSubmitting={isSubmitting}'), 'LoginPage must use SubmitButton');
      assert.ok(login.includes('<FormAlert message={formError}'), 'LoginPage must show server errors in FormAlert');
    });

    it('RegisterPage uses FormField, FormAlert, and SubmitButton with disabled state', () => {
      const reg = readSrc('pages/RegisterPage.jsx');
      assert.ok(reg.includes('<FormField'), 'RegisterPage must use FormField');
      assert.ok(reg.includes('disabled={isSubmitting'), 'RegisterPage fields must disable during submit');
      assert.ok(reg.includes('<SubmitButton isSubmitting={isSubmitting}'), 'RegisterPage must use SubmitButton');
      assert.ok(reg.includes('<FormAlert message={formError}'), 'RegisterPage must show server errors in FormAlert');
    });
  });

  describe('3. Profile & Resume Forms Audit', () => {
    it('ProfilePage uses FormField with accessible controls and sticky mobile submit bar', () => {
      const profile = readSrc('pages/ProfilePage.jsx');
      assert.ok(profile.includes('<FormField'), 'ProfilePage must use FormField');
      assert.ok(profile.includes('disabled={isSaving}'), 'ProfilePage inputs must disable while saving');
      assert.ok(profile.includes('aria-busy={isSaving}'), 'Profile submit must set aria-busy');
    });

    it('AddResumeCard uses FormField, FormTextarea, and FieldShell for file upload', () => {
      const resume = readSrc('pages/ResumePage.jsx');
      assert.ok(resume.includes('<FormField'), 'ResumePage must use FormField');
      assert.ok(resume.includes('<FormTextarea'), 'ResumePage must use FormTextarea');
      assert.ok(resume.includes('<FieldShell'), 'ResumePage file input must use FieldShell');
      assert.ok(resume.includes('disabled={isSaving}'), 'Resume inputs must disable while saving');
    });
  });

  describe('4. Assessment & Interview Interactive Forms Audit', () => {
    it('InterviewsPage modal defines semantic radiogroups with min 44px touch targets', () => {
      const interviews = readSrc('pages/InterviewsPage.jsx');
      assert.ok(interviews.includes('role="radiogroup"'), 'Modal must use radiogroup semantics');
      assert.ok(interviews.includes('role="radio"'), 'Options must use radio semantics');
      assert.ok(interviews.includes('aria-checked={isSelected}'), 'Selected option must set aria-checked');
      assert.ok(interviews.includes('min-h-[44px]'), 'Buttons must meet 44px min touch target');
    });

    it('InterviewSessionPage answer textarea links errors with aria-describedby and disables during submission', () => {
      const session = readSrc('pages/InterviewSessionPage.jsx');
      assert.ok(session.includes('htmlFor="interview-answer-input"'), 'Textarea must have associated label');
      assert.ok(session.includes('aria-invalid={Boolean(submitError)}'), 'Textarea must set aria-invalid');
      assert.ok(session.includes('aria-describedby='), 'Textarea must set aria-describedby');
      assert.ok(session.includes('disabled={isSubmitting}'), 'Textarea must disable when submitting');
      assert.ok(session.includes('id="interview-answer-error"'), 'Error box must have matching ID');
    });

    it('AssessmentRunnerPage Boolean questions use semantic radiogroup with touch targets', () => {
      const runner = readSrc('pages/AssessmentRunnerPage.jsx');
      assert.ok(runner.includes('role="radiogroup"'), 'Boolean group must use radiogroup');
      assert.ok(runner.includes('role="radio"'), 'Boolean options must use radio semantics');
      assert.ok(runner.includes('aria-checked={isSelected}'), 'Boolean options must set aria-checked');
      assert.ok(runner.includes('min-h-[44px]'), 'Inputs must have min-h-[44px]');
    });
  });
});
