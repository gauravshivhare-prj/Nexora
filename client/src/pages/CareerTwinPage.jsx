import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { FormAlert } from '../components/FormAlert.jsx';
import { SkillRow, StrengthBadge, strengthExplanation } from '../components/careerTwin/SkillEvidence.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import { STRENGTH_ORDER, fetchCareerTwin, generateCareerTwin } from '../services/careerTwin.service.js';
import { formatDateTime } from '../utils/dateFormat.js';
import { toMessage } from '../utils/errorMessage.js';

// Re-export for backward compatibility — other pages historically imported
// formatDateTime from CareerTwinPage. New code should import from utils/ directly.
export { formatDateTime };

/**
 * /career-twin — what Nexora has actually observed about a student.
 *
 * Everything on this page except the narrative is deterministic: the backend
 * built it from the profile and analysed resumes with no model involved. The
 * page is arranged to keep that distinction visible, because it is the whole
 * basis for trusting anything here. The skills come first, each with the
 * evidence behind it; the narrative comes last, labelled as written by a
 * model and explicitly not a source of fact.
 */

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function CareerTwinPage() {
  const [twin, setTwin] = useState(null);
  const [exists, setExists] = useState(false);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [isRetryable, setIsRetryable] = useState(false);
  /** True when the refusal was "there is nothing to build from". */
  const [needsInput, setNeedsInput] = useState(false);

  const load = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const result = await fetchCareerTwin({ signal });
      if (signal?.aborted) return;

      setTwin(result.twin);
      setExists(result.exists);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (error) {
      if (signal?.aborted) return;

      setLoadError(toMessage(error, 'Your CareerTwin could not be loaded.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function generate({ withNarrative }) {
    setIsGenerating(true);
    setGenerateError(null);
    setNeedsInput(false);

    try {
      setTwin(await generateCareerTwin({ withNarrative }));
      setExists(true);
    } catch (error) {
      const status = error instanceof ApiRequestError ? error.status : null;

      // 409 CAREER_TWIN_NO_INPUT is not a failure to retry — nothing will
      // change until the student adds something — so it gets a route to the
      // pages that would fix it instead of a "try again" that cannot work.
      if (error instanceof ApiRequestError && error.errorCode === 'CAREER_TWIN_NO_INPUT') {
        setNeedsInput(true);
      } else {
        setIsRetryable(status === null || status >= 500);
      }

      setGenerateError(toMessage(error, 'Your CareerTwin could not be generated.'));
    } finally {
      setIsGenerating(false);
    }
  }

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Loading your CareerTwin…" rows={3} />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Your CareerTwin could not be loaded"
          message={loadError}
          onRetry={() => load()}
        />
      </PageShell>
    );
  }

  const generateControls = (
    <GenerateControls
      exists={exists}
      isGenerating={isGenerating}
      onGenerate={generate}
      error={generateError}
      isRetryable={isRetryable}
      needsInput={needsInput}
    />
  );

  if (!exists) {
    return (
      <PageShell>
        <PageHeader title="CareerTwin">
          A picture of what you can actually demonstrate, built from your profile and any resumes
          you have analysed.
        </PageHeader>

        <Card title="Nothing built yet">
          <div className="flex flex-col gap-4">
            <EmptyState>
              You have no CareerTwin yet. Generating one reads your profile and analysed resumes —
              it does not change either.
            </EmptyState>
            {generateControls}
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="CareerTwin">
        Built {formatDateTime(twin.generatedAt)} from{' '}
        {describeSources(twin.sources, twin.indicators)}.
      </PageHeader>

      <div className="flex flex-col gap-5">
        {twin.isStale ? <StaleNotice reasons={twin.staleReasons} /> : null}

        <Card title="Regenerate" description="Rebuilds from whatever your profile and resumes say now.">
          {generateControls}
        </Card>

        <Indicators indicators={twin.indicators} />

        <Card
          title={`Skills (${twin.skills.length})`}
          description="Strongest evidence first. Every strength can be opened to see what it rests on."
        >
          {twin.skills.length === 0 ? (
            <EmptyState>No skills were found in your profile or analysed resumes.</EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <StrengthLegend />
              <ul className="flex flex-col gap-2">
                {[...twin.skills]
                  .sort(bySkillStrength)
                  .map((skill) => (
                    <SkillRow key={skill.key} skill={skill} />
                  ))}
              </ul>
            </div>
          )}
        </Card>

        <Context twin={twin} />

        <Narrative narrative={twin.narrative} />
      </div>
    </PageShell>
  );
}

/**
 * Strongest first, then alphabetical.
 *
 * Purely a display order over data the backend already decided. No strength
 * is computed here — recomputing one in the client would create a second
 * opinion about the thing the product is built to be precise about.
 */
function bySkillStrength(a, b) {
  const rank = STRENGTH_ORDER.indexOf(b.strength) - STRENGTH_ORDER.indexOf(a.strength);
  return rank !== 0 ? rank : a.name.localeCompare(b.name);
}

function StrengthLegend() {
  return (
    <dl className="flex flex-col gap-1.5 rounded-xl border border-orange-100 bg-orange-50/40 p-3 text-xs">
      {STRENGTH_ORDER.map((strength) => (
        <div key={strength} className="flex flex-wrap items-center gap-2">
          <dt>
            <StrengthBadge strength={strength} />
          </dt>
          <dd className="text-ink-muted">{strengthExplanation(strength)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The counts the backend computed.
 *
 * Shown as counts, not as a score. A single "readiness" number here would
 * have to weight the categories against each other, and any weighting
 * invented in the client would be arbitrary and would contradict the
 * backend's own scoring elsewhere.
 */
function Indicators({ indicators }) {
  const tiles = [
    ['Skills', indicators.totalSkills],
    ['Claimed only', indicators.claimedOnly],
    ['Supported', indicators.supported],
    ['Verified', indicators.verified],
    ['Projects', indicators.projectCount],
    ['Certifications', indicators.certificationCount],
    ['Analysed resumes', indicators.analysedResumeCount],
  ];

  return (
    <Card title="At a glance">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {indicators.verified === 0 ? (
        // Said plainly rather than left as a zero to interpret. Nothing in
        // Nexora produces verified evidence yet, and a student should not be
        // left wondering whether they have failed to earn any.
        <p className="mt-3 text-xs text-ink-muted">
          Nothing is verified yet. Verified evidence comes from assessments and AI interviews,
          which Nexora does not run yet — so a zero here is about the product, not about you.
        </p>
      ) : null}
    </Card>
  );
}

/** Interests, target roles and academic standing, as recorded. */
function Context({ twin }) {
  const hasAnything =
    twin.interests.length > 0 || twin.targetRoles.length > 0 || Boolean(twin.academic);

  if (!hasAnything) return null;

  return (
    <Card title="Direction">
      <div className="flex flex-col gap-4">
        {twin.targetRoles.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">Target roles</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {twin.targetRoles.map((role) => (
                <li
                  key={`${role.origin}-${role.title}`}
                  className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm text-ink"
                >
                  {role.title}
                  <span className="ml-1.5 text-xs text-ink-muted">({role.origin})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {twin.interests.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">Interests</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {twin.interests.map((interest) => (
                <li
                  key={interest}
                  className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm text-ink"
                >
                  {interest}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {twin.academic ? (
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">Academic</h3>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {[
                ['Degree', twin.academic.degree],
                ['Branch', twin.academic.branch],
                ['College', twin.academic.collegeName],
                ['Semester', twin.academic.currentSemester],
                ['Graduating', twin.academic.graduationYear],
                ['CGPA', twin.academic.cgpa],
              ]
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="shrink-0 font-medium text-ink-muted">{label}</dt>
                    <dd className="min-w-0 wrap-break-word text-ink">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The model-written summary, if one was generated.
 *
 * Framed as an opinion throughout: its own heading says it was written by a
 * model, the payload's `isModelWritten` flag is what gates this block, and
 * nothing in it is repeated anywhere else on the page as though it were
 * established. The backend already rejects a summary that mentions a skill
 * the student does not have — this is the second line of that defence, not
 * the first.
 */
function Narrative({ narrative }) {
  if (!narrative) return null;

  return (
    <Card title="Written summary">
      <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warning-text uppercase">
          <span aria-hidden="true">✎</span>
          Written by a model — not a verified fact
        </p>

        <p className="mt-2 text-sm leading-relaxed text-ink">{narrative.text}</p>

        <p className="mt-3 border-t border-orange-200 pt-3 text-xs text-ink-muted">
          Generated by {narrative.provider ?? 'an AI provider'}
          {narrative.model ? ` (${narrative.model})` : ''} on {formatDateTime(narrative.generatedAt)}
          . It is a restatement of the skills above, not evidence for them — everything it says
          should already be visible in the list.
        </p>
      </div>
    </Card>
  );
}

/**
 * The twin no longer matches its inputs.
 *
 * A warning with a reason and a fix, not a silent refresh: the backend
 * deliberately does not regenerate on read, because that would hide from the
 * student that their twin had gone out of date.
 */
function StaleNotice({ reasons }) {
  return (
    <div
      role="status"
      className="animate-rise rounded-2xl border border-orange-300 bg-orange-100/70 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-warning-text">
        <span aria-hidden="true">!</span>
        This CareerTwin is out of date
      </p>

      {reasons.length > 0 ? (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
          {reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-sm text-ink-muted">
        What you see below is still the last build. Regenerate to take your latest data into
        account.
      </p>
    </div>
  );
}

function GenerateControls({ exists, isGenerating, onGenerate, error, isRetryable, needsInput }) {
  return (
    <div className="flex flex-col gap-3">
      <FormAlert
        message={error}
        action={
          isRetryable && !isGenerating
            ? { label: 'Try again', onClick: () => onGenerate({ withNarrative: false }) }
            : undefined
        }
      />

      {needsInput ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-ink">
          Add a skill or a project on{' '}
          <Link to="/profile" className="font-semibold text-brand-text underline">
            your profile
          </Link>
          , or analyse a{' '}
          <Link to="/resume" className="font-semibold text-brand-text underline">
            resume
          </Link>
          , then come back.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => onGenerate({ withNarrative: false })}
          disabled={isGenerating}
          aria-busy={isGenerating}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted"
        >
          {isGenerating ? 'Building…' : exists ? 'Regenerate' : 'Build my CareerTwin'}
        </button>

        <button
          type="button"
          onClick={() => onGenerate({ withNarrative: true })}
          disabled={isGenerating}
          aria-busy={isGenerating}
          className="rounded-xl border border-orange-200 px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:text-ink-muted"
        >
          {isGenerating ? 'Building…' : 'Build with a written summary'}
        </button>
      </div>

      {/*
        The cost of the second button, before it is pressed. The twin itself
        never calls a model; only the summary does.
      */}
      <p className="text-xs text-ink-muted">
        The CareerTwin itself is built from your own data with no AI involved. The written summary
        is the only part that calls a model, and it is optional — if no provider is configured, the
        twin is still built and the summary is simply left out.
      </p>
    </div>
  );
}

function describeSources(sources, indicators) {
  const parts = [];

  if (sources.hasProfile) parts.push('your profile');
  if (indicators.analysedResumeCount > 0) {
    parts.push(
      `${indicators.analysedResumeCount} analysed resume${indicators.analysedResumeCount === 1 ? '' : 's'}`,
    );
  }

  if (parts.length === 0) return 'no recorded sources';
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(parts);
}
