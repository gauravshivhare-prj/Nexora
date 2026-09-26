import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_ROLES,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../constants/interviewOptions.js';
import {
  createInterviewSession,
  fetchInterviewSessions,
} from '../services/interview.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function InterviewsPage() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  // Form state
  const [selectedRole, setSelectedRole] = useState(INTERVIEW_ROLES[0].id);
  const [selectedSkills, setSelectedSkills] = useState(INTERVIEW_ROLES[0].skills.slice(0, 3));
  const [selectedDifficulty, setSelectedDifficulty] = useState(INTERVIEW_DIFFICULTY.INTERMEDIATE);
  const [questionCount, setQuestionCount] = useState(5);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const loadData = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);
    try {
      const { sessions: fetchedSessions } = await fetchInterviewSessions({ signal });
      if (signal?.aborted) return;
      setSessions(fetchedSessions);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(toMessage(err, 'Failed to load interview sessions.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // When role changes, update default selected skills
  function handleRoleChange(roleId) {
    setSelectedRole(roleId);
    const roleObj = INTERVIEW_ROLES.find((r) => r.id === roleId);
    if (roleObj) {
      setSelectedSkills(roleObj.skills.slice(0, 3));
    }
  }

  function handleSkillToggle(skillName) {
    if (selectedSkills.includes(skillName)) {
      if (selectedSkills.length > 1) {
        setSelectedSkills(selectedSkills.filter((s) => s !== skillName));
      }
    } else {
      if (selectedSkills.length < 5) {
        setSelectedSkills([...selectedSkills, skillName]);
      }
    }
  }

  async function handleCreateSession(e) {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const { session } = await createInterviewSession({
        targetRole: selectedRole,
        targetSkills: selectedSkills,
        difficulty: selectedDifficulty,
        questionCount: Number(questionCount),
      });

      navigate(`/interviews/${session.id}`);
    } catch (err) {
      setCreateError(toMessage(err, 'Failed to initialize interview session.'));
      setIsCreating(false);
    }
  }

  const activeRoleObj = INTERVIEW_ROLES.find((r) => r.id === selectedRole) || INTERVIEW_ROLES[0];

  return (
    <PageShell>
      <PageHeader
        backTo="/app"
        backLabel="Dashboard"
        title="AI Technical Interviews"
      >
        Simulated technical interviews with structured rubric evaluations, formative coaching, and transparent provenance.
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Truthful Provider & Evidence Advisory Notice */}
        <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="text-xl" aria-hidden="true">💡</span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-sm font-semibold text-ink">
                Formative Practice & Evaluation Transparency
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                AI interviews evaluate your answers across technical accuracy, depth, clarity, and relevance using curated rubrics.
                Unlike deterministic skill assessments, AI interviews are advisory preparation instruments and do not generate verified credentials without human evaluator sign-off.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-brand-text font-medium">
                <span>✓ Provenance Audited</span>
                <span>✓ Dimension Scoring</span>
                <span>✓ Advisory Credentialing</span>
              </div>
            </div>
          </div>
        </div>

        {/* Configure New Interview Card */}
        <Card
          title="Configure Interview Session"
          description="Select your target career track, focal skills, and difficulty level to generate tailored interview questions."
        >
          <form onSubmit={handleCreateSession} className="flex flex-col gap-5">
            {createError ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-surface p-3.5 text-xs text-danger-text">
                {createError}
              </div>
            ) : null}

            {/* Target Role Selector */}
            <div className="flex flex-col gap-2">
              <span id="target-role-label" className="text-xs font-semibold text-ink-muted uppercase">
                Target Role:
              </span>
              <div
                role="radiogroup"
                aria-labelledby="target-role-label"
                className="grid gap-2 sm:grid-cols-3"
              >
                {INTERVIEW_ROLES.map((role) => {
                  const isSelected = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleRoleChange(role.id)}
                      className={`flex min-h-[44px] flex-col items-start justify-center rounded-xl border p-3.5 text-left transition-colors duration-200 ${
                        isSelected
                          ? 'border-brand bg-orange-100/50 text-brand-text font-semibold'
                          : 'border-orange-100 bg-surface text-ink hover:border-orange-200'
                      }`}
                    >
                      <span className="text-sm">{role.title}</span>
                      <span className="text-[11px] text-ink-muted">
                        {role.skills.slice(0, 3).join(', ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Skills Toggle Chips */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span id="focal-skills-label" className="text-xs font-semibold text-ink-muted uppercase">
                  Focal Skills ({selectedSkills.length} selected):
                </span>
                <span className="text-[11px] text-ink-muted">Select 1 to 5 skills</span>
              </div>
              <div
                role="group"
                aria-labelledby="focal-skills-label"
                className="flex flex-wrap gap-2"
              >
                {activeRoleObj.skills.map((skill) => {
                  const isChecked = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      aria-pressed={isChecked}
                      onClick={() => handleSkillToggle(skill)}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                        isChecked
                          ? 'border-brand bg-brand text-on-brand'
                          : 'border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                      }`}
                    >
                      <span aria-hidden="true">{isChecked ? '✓' : '+'}</span>
                      <span>{skill}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty Tier */}
            <div className="flex flex-col gap-2">
              <span id="difficulty-tier-label" className="text-xs font-semibold text-ink-muted uppercase">
                Difficulty Tier:
              </span>
              <div
                role="radiogroup"
                aria-labelledby="difficulty-tier-label"
                className="grid gap-2 sm:grid-cols-3"
              >
                {INTERVIEW_DIFFICULTY_ORDER.map((diff) => {
                  const pres = INTERVIEW_DIFFICULTY_PRESENTATION[diff];
                  const isSelected = selectedDifficulty === diff;
                  return (
                    <button
                      key={diff}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedDifficulty(diff)}
                      className={`flex min-h-[44px] flex-col items-start justify-center rounded-xl border p-3.5 text-left transition-colors duration-200 ${
                        isSelected
                          ? 'border-brand bg-orange-100/50 text-brand-text font-semibold'
                          : 'border-orange-100 bg-surface text-ink hover:border-orange-200'
                      }`}
                    >
                      <span className="text-sm font-semibold capitalize">{pres.label}</span>
                      <span className="text-[11px] text-ink-muted leading-tight">{pres.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question Count Selection */}
            <div className="flex flex-col gap-2">
              <span id="question-count-label" className="text-xs font-semibold text-ink-muted uppercase">
                Number of Questions:
              </span>
              <div
                role="radiogroup"
                aria-labelledby="question-count-label"
                className="flex flex-wrap gap-2"
              >
                {[3, 5, 7].map((num) => {
                  const isSelected = questionCount === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setQuestionCount(num)}
                      className={`inline-flex min-h-[44px] min-w-[64px] items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold transition-colors duration-200 ${
                        isSelected
                          ? 'border-brand bg-brand text-on-brand'
                          : 'border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                      }`}
                    >
                      {num} Questions
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isCreating || selectedSkills.length === 0}
                aria-busy={isCreating}
                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? 'Initializing Interview Session…' : 'Start AI Interview'}
              </button>
            </div>
          </form>
        </Card>

        {/* Existing / Recent Sessions */}
        <Card
          title="Interview History & Active Sessions"
          description="View your active and past AI technical interview practice sessions."
        >
          {loadStatus === LOAD_STATUS.LOADING ? (
            <LoadingState label="Loading interview history…" rows={3} />
          ) : loadStatus === LOAD_STATUS.FAILED ? (
            <ErrorState title="Could not load interviews" message={loadError} onRetry={() => loadData()} />
          ) : sessions.length === 0 ? (
            <EmptyState>
              No interview sessions yet. Configure your first interview above to begin practice.
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sessions.map((sess) => {
                const statusPres = SESSION_STATUS_PRESENTATION[sess.status] ?? {
                  label: sess.status,
                  badgeClass: 'border-orange-200 bg-orange-50 text-ink',
                };
                const diffPres = INTERVIEW_DIFFICULTY_PRESENTATION[sess.difficulty] ?? {
                  label: sess.difficulty,
                  badgeClass: 'border-orange-200 bg-surface text-ink',
                };

                const isCompleted = sess.status === SESSION_STATUS.COMPLETED;
                const scorePercent = sess.overallScore !== null ? Math.round(sess.overallScore * 100) : null;

                return (
                  <div
                    key={sess.id}
                    className="flex flex-col justify-between rounded-xl border border-orange-100 bg-orange-50/20 p-4 transition-all duration-200 hover:border-orange-200"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${diffPres.badgeClass}`}>
                          {diffPres.label}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusPres.badgeClass}`}>
                          {statusPres.label}
                        </span>
                      </div>

                      <h3 className="mt-2 text-base font-semibold capitalize text-ink break-words">
                        {sess.targetRole.replace('-', ' ')}
                      </h3>

                      <p className="mt-1 text-xs text-brand-text break-words">
                        Skills: {sess.targetSkills.join(', ')}
                      </p>

                      <div className="mt-2 text-xs text-ink-muted">
                        {sess.questionCount} Questions · Evaluator: AI Rubric
                      </div>

                      {scorePercent !== null ? (
                        <div className="mt-2 text-sm font-bold text-ink">
                          Score: {scorePercent}%
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 border-t border-orange-100 pt-3">
                      <Link
                        to={`/interviews/${sess.id}`}
                        className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                      >
                        {isCompleted ? 'Review Evaluation' : 'Resume Interview'}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
