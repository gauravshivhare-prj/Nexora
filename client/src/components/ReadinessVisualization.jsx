import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CONTRIBUTOR_DEFINITIONS,
  READINESS_STATUS_PRESENTATION,
} from '../constants/readinessOptions.js';

export { CONTRIBUTOR_DEFINITIONS, READINESS_STATUS_PRESENTATION };

/**
 * Rich, explainable career readiness visualization bound to real API data.
 *
 * @param {{ readiness: object, role?: object }} props
 */
export function ReadinessVisualization({ readiness, role }) {
  const [showInfo, setShowInfo] = useState(false);

  if (!readiness) {
    return (
      <div className="rounded-xl border border-orange-100 bg-surface p-6 text-center text-sm text-ink-muted">
        No readiness data available. Match a career role to inspect evidence-based readiness.
      </div>
    );
  }

  const {
    evidenceStatus = 'insufficient_data',
    dataStatus = 'fresh',
    required = { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 },
    preferred = { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 },
    blockingSkills = [],
  } = readiness;

  const statusInfo = READINESS_STATUS_PRESENTATION[evidenceStatus] ?? READINESS_STATUS_PRESENTATION.insufficient_data;
  const reqTotal = required.total || (required.missing + required.claimed + required.supported + required.verified);

  // Proportions dynamically computed from real API data
  const verifiedPct = reqTotal > 0 ? Math.round((required.verified / reqTotal) * 100) : 0;
  const supportedPct = reqTotal > 0 ? Math.round((required.supported / reqTotal) * 100) : 0;
  const claimedPct = reqTotal > 0 ? Math.round((required.claimed / reqTotal) * 100) : 0;
  const missingPct = reqTotal > 0 ? Math.max(0, 100 - verifiedPct - supportedPct - claimedPct) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Evidence Status Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo.badgeClass}`}>
            {statusInfo.label}
          </span>
          {dataStatus === 'stale' && (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              Twin Outdated
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowInfo((prev) => !prev)}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline focus:outline-none focus:ring-2 focus:ring-brand/20 rounded-lg px-2"
          aria-expanded={showInfo}
          aria-controls="readiness-explainability-drawer"
        >
          <span aria-hidden="true">ℹ️</span>
          <span>{showInfo ? 'Hide Evidence Taxonomy' : 'How Readiness is Calculated'}</span>
        </button>
      </div>

      <p className="text-sm font-medium text-ink leading-relaxed">
        {statusInfo.description}
      </p>
      <p className="text-xs text-ink-muted">
        Readiness is based on evidence states, not a percentage or overall score.
      </p>

      {/* Stale State Notice */}
      {dataStatus === 'stale' && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-800">
          <strong>Note:</strong> Your CareerTwin has been updated since this readiness projection was derived.
          Rebuild CareerTwin from your profile to synchronize readiness.
        </div>
      )}

      {/* Dynamic Stacked Composition Bar */}
      {reqTotal > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider">Required Skills Composition ({reqTotal} total)</span>
            <span>
              {required.verified} verified · {required.supported} supported · {required.claimed} claimed · {required.missing} missing
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={`Required skills readiness: ${verifiedPct}% verified, ${supportedPct}% supported, ${claimedPct}% claimed, ${missingPct}% missing`}
            aria-valuenow={verifiedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 border border-orange-100"
          >
            {verifiedPct > 0 && (
              <div
                style={{ width: `${verifiedPct}%` }}
                title={`Verified: ${required.verified} (${verifiedPct}%)`}
                className="h-full rounded-l-full bg-green-600 transition-all duration-300"
              />
            )}
            {supportedPct > 0 && (
              <div
                style={{ width: `${supportedPct}%` }}
                title={`Supported: ${required.supported} (${supportedPct}%)`}
                className="h-full bg-sky-500 transition-all duration-300"
              />
            )}
            {claimedPct > 0 && (
              <div
                style={{ width: `${claimedPct}%` }}
                title={`Claimed: ${required.claimed} (${claimedPct}%)`}
                className="h-full bg-amber-400 transition-all duration-300"
              />
            )}
            {missingPct > 0 && (
              <div
                style={{ width: `${missingPct}%` }}
                title={`Missing: ${required.missing} (${missingPct}%)`}
                className="h-full rounded-r-full bg-rose-400 transition-all duration-300"
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Contributor Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONTRIBUTOR_DEFINITIONS.map((c) => {
          const reqCount = required[c.key] ?? 0;
          const prefCount = preferred[c.key] ?? 0;
          const weightPct = reqTotal > 0 ? Math.round((reqCount / reqTotal) * 100) : 0;

          return (
            <div
              key={c.key}
              className={`flex flex-col justify-between rounded-xl border ${c.borderClass} ${c.bgClass} p-3.5`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${c.colorBg}`} />
                  <span className="text-xs font-semibold text-ink">{c.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-ink">{reqCount}</span>
                  <span className="text-xs text-ink-muted">required</span>
                </div>
              </div>

              <div className="mt-2 border-t border-orange-100/60 pt-2 text-[11px] text-ink-muted">
                <span>{weightPct}% of required</span>
                {preferred.total > 0 && (
                  <span className="block text-[10px]">+{prefCount} preferred</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explainability Drawer */}
      {showInfo && (
        <div
          id="readiness-explainability-drawer"
          className="rounded-xl border border-orange-200 bg-surface p-4 text-xs text-ink space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
              Evidence Contributors Taxonomy
            </h4>
            <span className="text-ink-muted">Zero Canned Percentages</span>
          </div>

          <p className="text-ink-muted leading-relaxed">
            Nexora rejects arbitrary readiness percentages. Instead, readiness represents the exact composition of verifiable evidence for each skill asked by a role.
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2 pt-1">
            {CONTRIBUTOR_DEFINITIONS.map((c) => (
              <div key={c.key} className="rounded-lg border border-orange-100 p-2.5">
                <span className={`font-semibold ${c.textClass}`}>{c.label}: </span>
                <span className="text-ink-muted">{c.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocking Skills Section */}
      {blockingSkills.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-orange-100 bg-orange-50/20 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Actionable Blocking Skills ({blockingSkills.length})
            </h4>
            <span className="text-[11px] text-ink-muted">Prioritize for full readiness</span>
          </div>

          <ul className="flex flex-col gap-2">
            {blockingSkills.map((skill) => (
              <li
                key={skill.key || skill.name}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-lg border border-orange-100 bg-surface p-2.5 text-xs text-ink"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{skill.name}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    skill.status === 'missing'
                      ? 'border border-rose-200 bg-rose-50 text-rose-800'
                      : skill.status === 'claimed'
                        ? 'border border-amber-200 bg-amber-50 text-amber-800'
                        : 'border border-sky-200 bg-sky-50 text-sky-800'
                  }`}>
                    {skill.status}
                  </span>
                </div>
                {skill.reason && (
                  <span className="text-[11px] text-ink-muted break-words sm:max-w-md">
                    {skill.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Role Navigation Action Links */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        {role ? (
          <>
            <Link
              to={`/careers/${role.roleId}/skill-gap`}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
            >
              Inspect Skill Gap Evidence
            </Link>
            <Link
              to={`/careers/${role.roleId}/roadmap`}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
            >
              View Targeted Roadmap
            </Link>
          </>
        ) : null}
        <Link
          to="/assessments"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
        >
          Verify Skills in Assessments
        </Link>
        <Link
          to="/opportunities"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
        >
          Check Opportunities
        </Link>
      </div>
    </div>
  );
}
