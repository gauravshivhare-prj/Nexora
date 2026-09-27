import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../PageShell.jsx';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../../constants/interviewOptions.js';
import { fetchRoles } from '../../services/career.service.js';
import { formatDateTime } from '../../utils/dateFormat.js';

const DEFAULT_ROLES = [
  { id: 'backend-developer', title: 'Backend Developer', skills: ['Node.js', 'SQL', 'REST APIs', 'System Design'] },
  { id: 'frontend-developer', title: 'Frontend Developer', skills: ['React', 'JavaScript', 'HTML/CSS', 'TypeScript'] },
  { id: 'full-stack-developer', title: 'Full Stack Developer', skills: ['React', 'Node.js', 'SQL', 'Git'] },
  { id: 'data-engineer', title: 'Data Engineer', skills: ['Python', 'SQL', 'Data Pipelines', 'PostgreSQL'] },
];

export function InterviewSetup({
  recentSessions = [],
  isLoadingRecent = false,
  onStartSession,
  isStarting = false,
  startError = null,
}) {
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [selectedRoleId, setSelectedRoleId] = useState('backend-developer');
  const [selectedSkills, setSelectedSkills] = useState(['Node.js', 'SQL']);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [difficulty, setDifficulty] = useState(INTERVIEW_DIFFICULTY.INTERMEDIATE);
  const [questionCount, setQuestionCount] = useState(3);
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchRoles()
      .then((data) => {
        if (mounted && Array.isArray(data?.roles) && data.roles.length > 0) {
          const mapped = data.roles.map((r) => ({
            id: r.id || r.slug || r.title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            title: r.title,
            skills: Array.isArray(r.requiredSkills) ? r.requiredSkills : ['Node.js', 'SQL'],
          }));
          setRoles(mapped);
          if (!mapped.some((m) => m.id === selectedRoleId)) {
            setSelectedRoleId(mapped[0].id);
            setSelectedSkills(mapped[0].skills.slice(0, 3));
          }
        }
      })
      .catch(() => {
        // Fall back gracefully to DEFAULT_ROLES
      });
    return () => {
      mounted = false;
    };
  }, []);

  function handleRoleChange(newRoleId) {
    setSelectedRoleId(newRoleId);
    const found = roles.find((r) => r.id === newRoleId);
    if (found && Array.isArray(found.skills) && found.skills.length > 0) {
      setSelectedSkills(found.skills.slice(0, 3));
    }
    setValidationError(null);
  }

  function handleToggleSkill(skill) {
    if (selectedSkills.includes(skill)) {
      if (selectedSkills.length <= 1) {
        setValidationError('At least one target skill is required.');
        return;
      }
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      if (selectedSkills.length >= INTERVIEW_LIMITS.maxTargetSkills) {
        setValidationError(`Maximum ${INTERVIEW_LIMITS.maxTargetSkills} target skills allowed.`);
        return;
      }
      setSelectedSkills([...selectedSkills, skill]);
    }
    setValidationError(null);
  }

  function handleAddCustomSkill(e) {
    e.preventDefault();
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    if (selectedSkills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setValidationError('Skill is already selected.');
      return;
    }
    if (selectedSkills.length >= INTERVIEW_LIMITS.maxTargetSkills) {
      setValidationError(`Maximum ${INTERVIEW_LIMITS.maxTargetSkills} target skills allowed.`);
      return;
    }
    setSelectedSkills([...selectedSkills, trimmed]);
    setCustomSkillInput('');
    setValidationError(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedSkills.length === 0) {
      setValidationError('Please select at least one target skill.');
      return;
    }
    const roleObj = roles.find((r) => r.id === selectedRoleId);
    const targetRole = roleObj ? roleObj.title : 'Backend Developer';

    onStartSession({
      targetRole,
      targetSkills: selectedSkills,
      difficulty,
      questionCount: Number(questionCount),
    });
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
  const suggestedSkills = selectedRole?.skills || [];

  return (
    <div className="flex flex-col gap-8">
      {/* Session Configuration Form */}
      <Card
        title="Start AI Mock Interview"
        description="Select your target career role, focus skills, and difficulty level to generate an adaptive mock interview tailored to industry standards."
      >
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-6">
          {startError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-danger-text">
              <p className="font-semibold">{startError.title || 'Unable to start interview'}</p>
              <p className="mt-1">{startError.message}</p>
            </div>
          ) : null}

          {validationError ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {validationError}
            </div>
          ) : null}

          {/* Target Role Selection */}
          <div>
            <label htmlFor="target-role-select" className="block text-sm font-semibold text-ink">
              Target Career Role
            </label>
            <p className="mt-0.5 text-xs text-ink-muted">
              Questions and evaluation criteria are calibrated specifically for this role archetype.
            </p>
            <select
              id="target-role-select"
              value={selectedRoleId}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="mt-2 block w-full rounded-xl border border-orange-200 bg-surface px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand focus:border-brand focus:outline-none"
              disabled={isStarting}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Focus Skills Selection */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-ink">
                Focus Skills ({selectedSkills.length}/{INTERVIEW_LIMITS.maxTargetSkills})
              </label>
              <span className="text-xs text-ink-muted">Select 1 to 5 skills</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              Click skills to toggle inclusion. Each question will directly evaluate one of these competency areas.
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {suggestedSkills.map((skill) => {
                const isSelected = selectedSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => handleToggleSkill(skill)}
                    disabled={isStarting}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border border-brand bg-brand text-on-brand shadow-sm shadow-orange-900/10'
                        : 'border border-orange-200 bg-orange-50 text-ink-muted hover:border-brand hover:text-ink'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {skill}
                  </button>
                );
              })}
            </div>

            {/* Custom Skill Input */}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                placeholder="Add other skill (e.g. Docker, Redis)..."
                className="flex-1 rounded-xl border border-orange-200 bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:border-brand focus:border-brand focus:outline-none"
                disabled={isStarting || selectedSkills.length >= INTERVIEW_LIMITS.maxTargetSkills}
              />
              <button
                type="button"
                onClick={handleAddCustomSkill}
                disabled={isStarting || !customSkillInput.trim() || selectedSkills.length >= INTERVIEW_LIMITS.maxTargetSkills}
                className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-brand-text transition-colors hover:border-brand hover:bg-orange-100 disabled:opacity-50"
              >
                Add Skill
              </button>
            </div>
          </div>

          {/* Difficulty Level */}
          <div>
            <label className="block text-sm font-semibold text-ink">Interview Difficulty</label>
            <p className="mt-0.5 text-xs text-ink-muted">
              Controls question complexity, scenario depth, and rubric expectations.
            </p>
            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {INTERVIEW_DIFFICULTY_ORDER.map((diffKey) => {
                const isSelected = difficulty === diffKey;
                const presentation = INTERVIEW_DIFFICULTY_PRESENTATION[diffKey];
                return (
                  <button
                    key={diffKey}
                    type="button"
                    onClick={() => setDifficulty(diffKey)}
                    disabled={isStarting}
                    className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-brand bg-orange-50/70 shadow-sm'
                        : 'border-orange-100 bg-surface hover:border-orange-200'
                    }`}
                  >
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${presentation.badgeClass}`}>
                      {presentation.label}
                    </span>
                    <span className="mt-2 text-xs text-ink-muted leading-relaxed">
                      {presentation.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Count */}
          <div>
            <label htmlFor="question-count-select" className="block text-sm font-semibold text-ink">
              Number of Questions
            </label>
            <select
              id="question-count-select"
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              disabled={isStarting}
              className="mt-2 block w-36 rounded-xl border border-orange-200 bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-brand focus:border-brand focus:outline-none"
            >
              <option value={2}>2 Questions (Quick Check)</option>
              <option value={3}>3 Questions (Standard)</option>
              <option value={5}>5 Questions (Comprehensive)</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isStarting || selectedSkills.length === 0}
              className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isStarting ? 'Initializing Session…' : 'Start Practice Interview →'}
            </button>
          </div>
        </form>
      </Card>

      {/* Recent Sessions List */}
      <Card
        title="Your Interview History"
        description="Resume active in-progress interviews or review evaluations and evidence from previous sessions."
      >
        {isLoadingRecent ? (
          <p className="text-sm text-ink-muted">Loading your past interview sessions…</p>
        ) : recentSessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-ink-muted">
            No interview sessions yet. Configure your preferences above and start your first mock interview!
          </p>
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-orange-100">
            {recentSessions.map((session) => {
              const statusPresentation =
                SESSION_STATUS_PRESENTATION[session.status] || SESSION_STATUS_PRESENTATION[SESSION_STATUS.INITIALIZED];
              const isDone = session.status === SESSION_STATUS.COMPLETED;
              const isInProgress = session.status === SESSION_STATUS.IN_PROGRESS;

              return (
                <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink">{session.targetRole}</span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusPresentation.badgeClass}`}
                      >
                        {statusPresentation.label}
                      </span>
                      {typeof session.overallScore === 'number' ? (
                        <span className="text-xs font-semibold text-brand-text">
                          Score: {Math.round(session.overallScore * 100)}%
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {session.questionCount} Questions • {session.difficulty} •{' '}
                      {session.createdAt ? formatDateTime(session.createdAt) : 'Recently'}
                    </p>
                  </div>

                  <div>
                    <Link
                      to={`/interviews/${session.id}`}
                      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isInProgress
                          ? 'bg-brand text-on-brand hover:bg-brand-soft'
                          : isDone
                          ? 'border border-orange-200 bg-orange-50 text-brand-text hover:bg-orange-100'
                          : 'border border-orange-200 text-ink-muted hover:text-ink'
                      }`}
                    >
                      {isInProgress ? 'Resume Interview →' : isDone ? 'View Results' : 'Open Session'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
