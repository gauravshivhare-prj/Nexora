import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  ATTEMPT_STATUS,
  ATTEMPT_STATUS_PRESENTATION,
  DIFFICULTY_LEVELS,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESENTATION,
} from '../constants/assessmentOptions.js';
import { fetchAssessments, fetchUserAttempts } from '../services/assessment.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function AssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const [assessmentRes, attemptRes] = await Promise.all([
        fetchAssessments({ signal }),
        fetchUserAttempts({ signal }).catch(() => ({ attempts: [] })),
      ]);

      if (signal?.aborted) return;

      setAssessments(assessmentRes.assessments ?? []);
      setAttempts(attemptRes.attempts ?? []);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(toMessage(err, 'Failed to load assessment catalog.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Loading assessment catalog…" rows={3} />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Could not load assessments"
          message={loadError}
          onRetry={() => loadData()}
        />
      </PageShell>
    );
  }

  // Filter assessments
  const filtered = assessments.filter((item) => {
    const matchesDifficulty =
      selectedDifficulty === 'all' || item.difficulty === selectedDifficulty;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      item.title.toLowerCase().includes(query) ||
      (item.canonicalSkill && item.canonicalSkill.toLowerCase().includes(query)) ||
      (item.skillName && item.skillName.toLowerCase().includes(query)) ||
      item.description.toLowerCase().includes(query);

    return matchesDifficulty && matchesQuery;
  });

  // Group latest attempt per assessment
  const attemptsByAssessment = {};
  for (const att of attempts) {
    if (!attemptsByAssessment[att.assessmentId]) {
      attemptsByAssessment[att.assessmentId] = att;
    }
  }

  return (
    <PageShell>
      <PageHeader
        backTo="/app"
        backLabel="Dashboard"
        title="Skill Assessments"
      >
        Verified assessments to prove your capabilities and elevate your CareerTwin with verified evidence.
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Filter and Search Bar */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                Difficulty:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDifficulty('all')}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                  selectedDifficulty === 'all'
                    ? 'bg-brand text-on-brand'
                    : 'border border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                }`}
              >
                All
              </button>
              {DIFFICULTY_ORDER.map((diff) => {
                const isSelected = selectedDifficulty === diff;
                return (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold capitalize transition-colors duration-200 ${
                      isSelected
                        ? 'bg-brand text-on-brand'
                        : 'border border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                    }`}
                  >
                    {DIFFICULTY_PRESENTATION[diff]?.label ?? diff}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-0 sm:w-64">
              <label htmlFor="assessment-search" className="sr-only">
                Search assessments
              </label>
              <input
                id="assessment-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assessments by skill or topic…"
                className="w-full min-h-[44px] rounded-xl border border-orange-200 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </div>
          </div>
        </Card>

        {/* Assessment Cards List */}
        <Card
          title={`Available Assessments (${filtered.length})`}
          description="Select an assessment to begin or resume your attempt. Scoring is strictly server-verified."
        >
          {filtered.length === 0 ? (
            <EmptyState>
              No assessments match your current filters. Try selecting a different difficulty or clearing your search.
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((item) => {
                const latestAttempt = attemptsByAssessment[item.id || item.assessmentId];
                return (
                  <AssessmentCard
                    key={item.id || item.assessmentId}
                    assessment={item}
                    latestAttempt={latestAttempt}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function AssessmentCard({ assessment, latestAttempt }) {
  const diffPresentation =
    DIFFICULTY_PRESENTATION[assessment.difficulty] ??
    DIFFICULTY_PRESENTATION[DIFFICULTY_LEVELS.BEGINNER];

  const duration = assessment.timeLimitMinutes || assessment.durationMinutes || 20;
  const questionsCount = assessment.totalQuestions || assessment.questions?.length || 0;
  const passPercent = Math.round((assessment.passMark ?? 0.7) * 100);

  // Attempt status badge
  let statusBadge = (
    <span className="inline-flex shrink-0 items-center rounded-full border border-orange-200 bg-orange-50/60 px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
      Not attempted
    </span>
  );

  let ctaLabel = 'Start Assessment';
  let ctaPrimary = true;

  if (latestAttempt) {
    if (latestAttempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
      statusBadge = (
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            ATTEMPT_STATUS_PRESENTATION[ATTEMPT_STATUS.IN_PROGRESS]?.badgeClass ??
            'border-sky-200 bg-sky-50 text-sky-800'
          }`}
        >
          In Progress
        </span>
      );
      ctaLabel = 'Resume Assessment';
    } else if (latestAttempt.status === ATTEMPT_STATUS.EVALUATED || latestAttempt.result) {
      const isPassed = latestAttempt.result?.passed ?? (latestAttempt.result?.score >= (assessment.passMark ?? 0.7));
      statusBadge = isPassed ? (
        <span className="inline-flex shrink-0 items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
          Completed · Passed
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          Completed · Not Passed
        </span>
      );
      ctaLabel = 'Retake Assessment';
      ctaPrimary = false;
    } else if (latestAttempt.status === ATTEMPT_STATUS.TIMED_OUT) {
      statusBadge = (
        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          Timed Out
        </span>
      );
      ctaLabel = 'Retake Assessment';
      ctaPrimary = false;
    }
  }

  const assessmentId = assessment.id || assessment.assessmentId;

  return (
    <div className="flex flex-col justify-between rounded-xl border border-orange-100 bg-orange-50/20 p-5 transition-all duration-200 hover:border-orange-200 hover:shadow-sm">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${diffPresentation.badgeClass}`}
          >
            {diffPresentation.label}
          </span>
          {statusBadge}
        </div>

        <h3 className="mt-3 text-base font-semibold tracking-tight text-ink break-words">
          {assessment.title}
        </h3>

        <p className="mt-1 text-xs font-medium text-brand-text break-words">
          Skill: {assessment.canonicalSkill || assessment.skillName}
        </p>

        <p className="mt-2 text-sm text-ink-muted break-words">
          {assessment.description}
        </p>
      </div>

      <div className="mt-5 border-t border-orange-100 pt-3">
        <dl className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-surface/80 p-1.5">
            <dt className="text-ink-muted">Time</dt>
            <dd className="font-semibold text-ink">{duration} min</dd>
          </div>
          <div className="rounded-lg bg-surface/80 p-1.5">
            <dt className="text-ink-muted">Questions</dt>
            <dd className="font-semibold text-ink">{questionsCount}</dd>
          </div>
          <div className="rounded-lg bg-surface/80 p-1.5">
            <dt className="text-ink-muted">Pass Mark</dt>
            <dd className="font-semibold text-ink">{passPercent}%</dd>
          </div>
        </dl>

        <div className="mt-4">
          <Link
            to={`/assessments/${assessmentId}/run`}
            className={`flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
              ctaPrimary
                ? 'bg-brand text-on-brand hover:bg-brand-soft'
                : 'border border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
            }`}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
