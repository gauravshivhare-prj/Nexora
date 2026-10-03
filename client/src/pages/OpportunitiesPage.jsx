import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  OPPORTUNITY_FILTER_TYPES,
  OPPORTUNITY_SOURCE_PRESENTATION,
  OPPORTUNITY_SOURCE_TYPES,
} from '../constants/opportunityOptions.js';
import { fetchOpportunities } from '../services/opportunity.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function OpportunitiesPage() {
  const [data, setData] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  // Tabs & Filters
  const [viewCategory, setViewCategory] = useState('matched'); // 'matched' | 'near_miss'
  const [sourceFilter, setSourceFilter] = useState(OPPORTUNITY_FILTER_TYPES.ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);

  const load = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const result = await fetchOpportunities({ signal });
      if (signal?.aborted) return;

      setData(result);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toMessage(error, 'Opportunities could not be loaded.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Handle escape key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && selectedOpportunity) {
        setSelectedOpportunity(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOpportunity]);

  const allOpportunities = data?.opportunities ?? [];
  const nearMissOpportunities = data?.nearMiss ?? [];
  const currentPool = viewCategory === 'near_miss' ? nearMissOpportunities : allOpportunities;

  // Single-pass memoized filtering and count calculation
  const { filteredOpportunities, curatedCount, liveCount } = useMemo(() => {
    let curated = 0;
    let live = 0;
    const filtered = [];
    const query = searchQuery.trim().toLowerCase();

    for (const opp of currentPool) {
      if (opp.isCurated) curated++;
      if (opp.isLive) live++;

      // Source filter
      if (sourceFilter === OPPORTUNITY_FILTER_TYPES.CURATED && !opp.isCurated) continue;
      if (sourceFilter === OPPORTUNITY_FILTER_TYPES.LIVE && !opp.isLive) continue;

      // Keyword search
      if (query) {
        const matchesTitle = opp.title.toLowerCase().includes(query);
        const matchesSummary = opp.summary.toLowerCase().includes(query);
        const matchesSkills = opp.requiredSkills.some((s) => s.toLowerCase().includes(query));
        const matchesRoles = opp.targetRoleIds.some((r) => r.toLowerCase().includes(query));
        if (!matchesTitle && !matchesSummary && !matchesSkills && !matchesRoles) {
          continue;
        }
      }

      filtered.push(opp);
    }

    return { filteredOpportunities: filtered, curatedCount: curated, liveCount: live };
  }, [currentPool, sourceFilter, searchQuery]);

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState message="Checking verified skills against opportunity catalogue..." />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Could not load opportunities"
          message={loadError}
          onRetry={() => load()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Evidence-Based Matching"
        title="Opportunities"
        description="Opportunities matched deterministically against your verified skills and target role. Nexora does not invent speculative match percentages."
      />

      <div className="flex flex-col gap-6">
        {/* Category Mode Switcher: Matched vs Near-Miss */}
        <div className="flex flex-wrap items-center gap-3 border-b border-orange-100 pb-4">
          <button
            type="button"
            onClick={() => {
              setViewCategory('matched');
              setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL);
            }}
            className={`min-h-[44px] rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
              viewCategory === 'matched'
                ? 'bg-brand text-on-brand shadow-sm'
                : 'border border-orange-200 bg-surface text-ink hover:border-brand/50'
            }`}
          >
            ✓ Fully Matched ({allOpportunities.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewCategory('near_miss');
              setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL);
            }}
            className={`min-h-[44px] rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
              viewCategory === 'near_miss'
                ? 'bg-brand text-on-brand shadow-sm'
                : 'border border-orange-200 bg-surface text-ink hover:border-brand/50'
            }`}
          >
            ★ Unlockable Near-Misses ({nearMissOpportunities.length})
          </button>
        </div>

        {/* Provenance & Methodology Notice */}
        <div className="rounded-2xl border border-orange-200 bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-semibold text-brand-text">
                <span aria-hidden="true">✓</span> Deterministic Match
              </span>
              <span>
                {viewCategory === 'near_miss'
                  ? 'Shows opportunities where you meet required skill thresholds with clear actions to unlock'
                  : 'Requires 100% verified skills & profile target role'}
              </span>
            </div>

            {data?.catalogue && (
              <div className="flex items-center gap-3 text-ink-muted">
                <span>Catalogue v{data.catalogue.version}</span>
                {data.catalogue.source?.asOf && (
                  <span>· As of {data.catalogue.source.asOf}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Source Tabs */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Opportunity source filters">
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.ALL
                  ? 'bg-surface border-2 border-brand text-brand-text font-bold shadow-xs'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              All Sources ({currentPool.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.CURATED)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.CURATED
                  ? 'bg-surface border-2 border-brand text-brand-text font-bold shadow-xs'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              Curated Practice ({curatedCount})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.LIVE)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.LIVE
                  ? 'bg-surface border-2 border-brand text-brand-text font-bold shadow-xs'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              Live Opportunities ({liveCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <label htmlFor="opportunity-search" className="sr-only">
              Search opportunities by title, skill, or role
            </label>
            <input
              id="opportunity-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, skill, or role..."
              className="w-full min-h-[44px] rounded-xl border border-orange-200 bg-surface px-4 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted hover:text-ink min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* List of Opportunities */}
        {filteredOpportunities.length === 0 ? (
          allOpportunities.length === 0 ? (
            <Card>
              <EmptyState>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-base font-semibold text-ink">
                    No opportunities currently match your verified evidence.
                  </p>
                  <p className="max-w-md text-xs text-ink-muted">
                    Nexora matches opportunities when all required skills are verified through assessments and your profile target role matches the role criteria. Claimed or unverified skills do not qualify.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-3">
                    <Link
                      to="/assessments"
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                    >
                      Take a Technical Assessment
                    </Link>
                    <Link
                      to="/profile"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Update Profile Target Role
                    </Link>
                    <Link
                      to="/careers"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Browse Career Roles
                    </Link>
                  </div>
                </div>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <EmptyState>
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-semibold text-ink">
                    No opportunities match your current filters.
                  </p>
                  <p className="text-xs text-ink-muted">
                    Try clearing your search query or selecting a different source type.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL);
                      setSearchQuery('');
                    }}
                    className="mt-2 inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                  >
                    Reset Filters
                  </button>
                </div>
              </EmptyState>
            </Card>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredOpportunities.map((opportunity) => {
              const presentation =
                OPPORTUNITY_SOURCE_PRESENTATION[opportunity.source.type] ??
                OPPORTUNITY_SOURCE_PRESENTATION.curated_internal;

              return (
                <div
                  key={opportunity.id}
                  className="flex flex-col justify-between rounded-2xl border border-orange-100 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3">
                    {/* Source & Curated vs Live Badge Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${presentation.badgeClass}`}
                        >
                          <span aria-hidden="true">{presentation.icon}</span>
                          {presentation.label}
                        </span>

                        {opportunity.matchScore !== undefined && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              opportunity.matchScore === 100
                                ? 'border border-green-200 bg-green-50 text-green-800'
                                : 'border border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            {opportunity.matchScore}% Match
                          </span>
                        )}
                      </div>

                      {opportunity.expiresAt ? (
                        <span className="text-[11px] text-ink-muted">
                          Valid until {opportunity.expiresAt}
                        </span>
                      ) : opportunity.source.asOf ? (
                        <span className="text-[11px] text-ink-muted">
                          Source date: {opportunity.source.asOf}
                        </span>
                      ) : null}
                    </div>

                    {/* Title & Summary */}
                    <div>
                      <h3 className="text-base font-bold text-ink">{opportunity.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                        {opportunity.summary}
                      </p>
                    </div>

                    {/* Required Skills */}
                    {opportunity.requiredSkills.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                          Required Skills:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {opportunity.requiredSkills.map((skill) => {
                            const isMissing = opportunity.gapToEligibility?.some((g) => g.skill.toLowerCase() === skill.toLowerCase());
                            return (
                              <span
                                key={skill}
                                className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${
                                  isMissing
                                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-green-200 bg-green-50 text-green-800'
                                }`}
                              >
                                {isMissing ? '○ ' : '✓ '} {skill}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Target Roles */}
                    {opportunity.targetRoleIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <span className="font-semibold text-ink">Target Roles:</span>
                        {opportunity.targetRoleIds.map((roleId) => (
                          <span
                            key={roleId}
                            className="inline-flex rounded-md border border-orange-100 bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink"
                          >
                            {roleId}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Matching Explanation */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-2.5 text-xs text-ink">
                      <span className="font-semibold text-brand-text">Match Reason: </span>
                      <span className="text-ink-muted">{opportunity.explanation}</span>
                    </div>

                    {/* Near-Miss Actionable Gaps */}
                    {opportunity.gapToEligibility && opportunity.gapToEligibility.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-xs">
                        <span className="font-bold text-amber-900 block mb-1.5">
                          Actions to Unlock ({opportunity.gapToEligibility.length} remaining):
                        </span>
                        <ul className="space-y-1.5">
                          {opportunity.gapToEligibility.map((gap) => (
                            <li key={gap.skill} className="flex items-start gap-1.5 text-[11px] text-amber-950">
                              <span className="text-amber-600 font-bold">•</span>
                              <span><strong>{gap.skill}:</strong> {gap.action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-orange-100/60 pt-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOpportunity(opportunity)}
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                    >
                      View Details &amp; Criteria
                    </button>
                    <Link
                      to="/interviews"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Practice Interview
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Opportunity Detail Modal */}
        {selectedOpportunity && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-detail-title"
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-orange-200 bg-canvas p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        (OPPORTUNITY_SOURCE_PRESENTATION[selectedOpportunity.source.type] ??
                          OPPORTUNITY_SOURCE_PRESENTATION.curated_internal).badgeClass
                      }`}
                    >
                      {
                        (OPPORTUNITY_SOURCE_PRESENTATION[selectedOpportunity.source.type] ??
                          OPPORTUNITY_SOURCE_PRESENTATION.curated_internal).label
                      }
                    </span>

                    {selectedOpportunity.matchScore !== undefined && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          selectedOpportunity.matchScore === 100
                            ? 'border border-green-200 bg-green-50 text-green-800'
                            : 'border border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {selectedOpportunity.matchScore}% Match
                      </span>
                    )}
                  </div>

                  <h2 id="opportunity-detail-title" className="mt-2 text-lg font-bold text-ink">
                    {selectedOpportunity.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOpportunity(null)}
                  className="min-h-[44px] min-w-[44px] rounded-xl text-ink-muted hover:bg-orange-100 hover:text-ink flex items-center justify-center"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">Summary</h4>
                  <p className="mt-1 text-ink-muted leading-relaxed">{selectedOpportunity.summary}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Eligibility &amp; Verification
                  </h4>
                  <p className="mt-1 text-ink-muted">{selectedOpportunity.explanation}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedOpportunity.requiredSkills.map((skill) => {
                      const isMissing = selectedOpportunity.gapToEligibility?.some((g) => g.skill.toLowerCase() === skill.toLowerCase());
                      return (
                        <span
                          key={skill}
                          className={`inline-flex rounded-lg border px-2 py-0.5 font-medium ${
                            isMissing
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : 'border-green-200 bg-green-50 text-green-800'
                          }`}
                        >
                          {isMissing ? '○ Need: ' : '✓ Verified: '} {skill}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {selectedOpportunity.gapToEligibility && selectedOpportunity.gapToEligibility.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <h4 className="font-bold text-amber-900 text-xs mb-1.5">
                      Recommended Steps to Qualify:
                    </h4>
                    <ul className="space-y-1.5">
                      {selectedOpportunity.gapToEligibility.map((gap) => (
                        <li key={gap.skill} className="flex items-start gap-1.5 text-[11px] text-amber-950">
                          <span className="text-amber-600 font-bold">•</span>
                          <span><strong>{gap.skill}:</strong> {gap.action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Target Roles
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedOpportunity.targetRoleIds.map((roleId) => (
                      <span
                        key={roleId}
                        className="inline-flex rounded-md border border-orange-100 bg-surface px-2.5 py-1 text-ink font-medium"
                      >
                        {roleId}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3">
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Provenance &amp; Validity
                  </h4>
                  <div className="mt-1 space-y-1 text-ink-muted">
                    <p>
                      <strong>Source Type:</strong> {selectedOpportunity.source.type}
                    </p>
                    <p>
                      <strong>Catalogue Version:</strong> v{selectedOpportunity.source.version}
                    </p>
                    {selectedOpportunity.addedDate && (
                      <p>
                        <strong>Added On:</strong> {selectedOpportunity.addedDate}
                      </p>
                    )}
                    {selectedOpportunity.expiresAt && (
                      <p>
                        <strong>Valid Until:</strong> {selectedOpportunity.expiresAt}
                      </p>
                    )}
                    <p>
                      <strong>Matching Engine:</strong> Pure deterministic evaluation against verified evidence
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2.5 border-t border-orange-100 pt-4">
                <Link
                  to="/assessments"
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand"
                >
                  Verify More Skills
                </Link>
                <Link
                  to="/interviews"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                >
                  Practice Interview
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
