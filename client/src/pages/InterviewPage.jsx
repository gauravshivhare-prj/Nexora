import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Card, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { InterviewActiveFlow } from '../components/interview/InterviewActiveFlow.jsx';
import { InterviewResults } from '../components/interview/InterviewResults.jsx';
import { InterviewSetup } from '../components/interview/InterviewSetup.jsx';
import {
  SESSION_STATUS,
  isSessionActive,
  isSessionExpired,
  resolveInterviewError,
} from '../constants/interviewOptions.js';
import {
  abandonInterviewSession,
  completeInterviewSession,
  createInterviewSession,
  fetchInterviewSessionById,
  fetchInterviewSessions,
  startInterviewSession,
  submitInterviewAnswer,
} from '../services/interview.service.js';

export function InterviewPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(sessionId));
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Active question index pointer
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Action states
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState(null);
  const [completionData, setCompletionData] = useState(null);

  const [isAbandoning, setIsAbandoning] = useState(false);

  // Load session by ID if URL has parameter
  const loadSession = useCallback(
    async (id, signal) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { session: fetchedSession } = await fetchInterviewSessionById(id, { signal });
        if (signal?.aborted) return;
        setSession(fetchedSession);

        // Find first question without evaluation, or default to currentQuestionIndex
        if (Array.isArray(fetchedSession.questions) && fetchedSession.questions.length > 0) {
          const nextUnansweredIdx = fetchedSession.questions.findIndex((q) => !q.evaluation);
          if (nextUnansweredIdx !== -1) {
            setCurrentQuestionIndex(nextUnansweredIdx);
          } else {
            setCurrentQuestionIndex(Math.max(0, fetchedSession.questions.length - 1));
          }
        }
      } catch (err) {
        if (signal?.aborted) return;
        setLoadError(resolveInterviewError(err));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [],
  );

  // Load recent sessions for setup view
  const loadRecentSessions = useCallback(async (signal) => {
    setIsLoadingRecent(true);
    try {
      const { sessions } = await fetchInterviewSessions({ signal });
      if (signal?.aborted) return;
      setRecentSessions(sessions);
    } catch {
      // Non-critical, ignore
    } finally {
      if (!signal?.aborted) setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (sessionId) {
      loadSession(sessionId, controller.signal);
    } else {
      setSession(null);
      setIsLoading(false);
      loadRecentSessions(controller.signal);
    }
    return () => controller.abort();
  }, [sessionId, loadSession, loadRecentSessions]);

  // Handler: Start a new practice interview
  async function handleStartSession(payload) {
    setIsStarting(true);
    setStartError(null);
    try {
      const { session: initialized } = await createInterviewSession(payload);
      const { session: started } = await startInterviewSession(initialized.id);
      setSession(started);
      navigate(`/interviews/${started.id}`);
    } catch (err) {
      setStartError(resolveInterviewError(err));
    } finally {
      setIsStarting(false);
    }
  }

  // Handler: Submit answer for current question
  async function handleAnswerSubmit(questionId, payload) {
    if (!session) return;
    setIsSubmittingAnswer(true);
    setSubmitError(null);

    try {
      const result = await submitInterviewAnswer(session.id, questionId, payload);
      setSession(result.session);
    } catch (err) {
      setSubmitError(resolveInterviewError(err));
    } finally {
      setIsSubmittingAnswer(false);
    }
  }

  // Handler: Proceed to next question
  function handleNextQuestion() {
    if (!session) return;
    const nextIdx = currentQuestionIndex + 1;
    if (nextIdx < session.questions.length) {
      setCurrentQuestionIndex(nextIdx);
    }
  }

  // Handler: Complete interview session
  async function handleCompleteSession() {
    if (!session) return;
    setIsCompleting(true);
    setCompleteError(null);

    try {
      const result = await completeInterviewSession(session.id);
      setSession(result.session);
      setCompletionData(result);
    } catch (err) {
      setCompleteError(resolveInterviewError(err));
    } finally {
      setIsCompleting(false);
    }
  }

  // Handler: Abandon interview session
  async function handleAbandonSession() {
    if (!session) return;
    setIsAbandoning(true);
    try {
      const { session: abandoned } = await abandonInterviewSession(session.id);
      setSession(abandoned);
    } catch (err) {
      setSubmitError(resolveInterviewError(err));
    } finally {
      setIsAbandoning(false);
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <PageShell width="max-w-4xl">
        <PageHeader title="AI Mock Interview">
          Loading your interview session…
        </PageHeader>
        <LoadingState label="Loading interview session…" rows={2} />
      </PageShell>
    );
  }

  // Load error state
  if (loadError) {
    return (
      <PageShell width="max-w-4xl">
        <PageHeader title="AI Mock Interview">
          Review or conduct your practice session.
        </PageHeader>
        <ErrorState
          title={loadError.title || 'Interview session could not be loaded'}
          message={loadError.message}
          onRetry={() => loadSession(sessionId)}
          retryLabel="Reload Session"
        />
      </PageShell>
    );
  }

  // Setup view if no active session in URL
  if (!session) {
    return (
      <PageShell width="max-w-4xl">
        <PageHeader title="AI Mock Interview">
          Practice adaptive technical interviews, receive verified rubric critiques, and build evidence toward your CareerTwin readiness.
        </PageHeader>
        <InterviewSetup
          recentSessions={recentSessions}
          isLoadingRecent={isLoadingRecent}
          onStartSession={handleStartSession}
          isStarting={isStarting}
          startError={startError}
        />
      </PageShell>
    );
  }

  // Results view if session is completed
  if (session.status === SESSION_STATUS.COMPLETED) {
    return (
      <PageShell width="max-w-4xl">
        <PageHeader
          backTo="/interviews"
          backLabel="All Interviews"
          title="Interview Results"
        >
          Institutional evidence and rubric evaluation summary.
        </PageHeader>
        <InterviewResults
          session={session}
          completionData={completionData}
          onRestartSetup={() => {
            setSession(null);
            navigate('/interviews');
          }}
        />
      </PageShell>
    );
  }

  // Terminal state view if session was abandoned or timed out
  if (
    session.status === SESSION_STATUS.ABANDONED ||
    session.status === SESSION_STATUS.TIMED_OUT ||
    isSessionExpired(session)
  ) {
    const isTimeout = session.status === SESSION_STATUS.TIMED_OUT || isSessionExpired(session);

    return (
      <PageShell width="max-w-4xl">
        <PageHeader
          backTo="/interviews"
          backLabel="All Interviews"
          title={isTimeout ? 'Session Expired' : 'Session Abandoned'}
        >
          This practice session has ended.
        </PageHeader>
        <Card
          title={isTimeout ? 'Interview Time Limit Reached' : 'Interview Session Abandoned'}
          description={
            isTimeout
              ? 'The allotted time for this interview has passed. Answers submitted before expiration are recorded below.'
              : 'You abandoned this interview session before completing all questions.'
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              {isTimeout
                ? 'Time limits simulate authentic technical screening conditions. You can start a new practice session anytime.'
                : 'Abandoned sessions do not impact your baseline score, but no final competency evidence is granted.'}
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  navigate('/interviews');
                }}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-soft"
              >
                Start New Practice Interview →
              </button>
            </div>
          </div>
        </Card>
      </PageShell>
    );
  }

  // Active interview in_progress (or initialized)
  return (
    <PageShell width="max-w-4xl">
      <PageHeader
        backTo="/interviews"
        backLabel="Exit Interview"
        title="AI Mock Interview"
      >
        Answer each question thoroughly using the rubric guidelines.
      </PageHeader>

      <InterviewActiveFlow
        session={session}
        currentQuestionIndex={currentQuestionIndex}
        onAnswerSubmit={handleAnswerSubmit}
        isSubmittingAnswer={isSubmittingAnswer}
        submitError={submitError}
        onRetrySubmit={() => {
          const q = session.questions[currentQuestionIndex];
          if (q) handleAnswerSubmit(q.id || q.questionId, { answerText: q.answer?.answerText || '', durationSeconds: 45 });
        }}
        onNextQuestion={handleNextQuestion}
        onCompleteSession={handleCompleteSession}
        isCompleting={isCompleting}
        completeError={completeError}
        onAbandonSession={handleAbandonSession}
        isAbandoning={isAbandoning}
      />
    </PageShell>
  );
}
