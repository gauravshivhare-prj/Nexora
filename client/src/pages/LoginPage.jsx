import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { FormAlert } from '../components/FormAlert.jsx';
import { FormField } from '../components/FormField.jsx';
import { SubmitButton } from '../components/SubmitButton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import { collectErrors, validateEmail, validateExistingPassword } from '../utils/authValidation.js';

export function LoginPage() {
  const { login, isAuthenticated, isRestoring } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Where the user was heading before being redirected here.
  const destination = location.state?.from ?? '/app';

  // Already signed in — no reason to show a login form.
  if (isAuthenticated) return <Navigate to={destination} replace />;

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a field's error as soon as it is edited: keeping it visible while
    // the user fixes it reads as the form arguing with them.
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = collectErrors({
      email: () => validateEmail(values.email),
      password: () => validateExistingPassword(values.password),
    });

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await login({ email: values.email.trim(), password: values.password });
      navigate(destination, { replace: true });
    } catch (error) {
      setFormError(toLoginMessage(error));
      setIsSubmitting(false);
    }
    // Deliberately no setIsSubmitting(false) on success: the component
    // unmounts on navigation, and setting state afterwards warns.
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Continue building your career readiness."
      footer={
        <>
          New to Nexora?{' '}
          <Link to="/register" className="font-semibold text-brand-text hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <FormAlert message={formError} />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          value={values.email}
          onChange={setField('email')}
          error={fieldErrors.email}
          autoComplete="email"
          disabled={isSubmitting || isRestoring}
          placeholder="you@college.edu"
        />

        <FormField
          label="Password"
          type="password"
          value={values.password}
          onChange={setField('password')}
          error={fieldErrors.password}
          autoComplete="current-password"
          disabled={isSubmitting || isRestoring}
        />

        <div className="mt-2">
          <SubmitButton isSubmitting={isSubmitting} busyLabel="Signing in…">
            Sign in
          </SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}

/**
 * Turns a failure into something a user can act on.
 *
 * The backend's own 400/401 messages are written for display and are shown
 * as-is. Anything else gets a generic line, because an unexpected error's
 * message may contain internals.
 */
function toLoginMessage(error) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Incorrect email or password. Please try again.';
    if (error.status === 400) return error.message;
    if (error.status === null) return error.message; // network / timeout
    if (error.status >= 500) {
      return 'Nexora is having trouble right now. Please try again in a moment.';
    }
    return error.message;
  }

  console.error('Unexpected login failure:', error);
  return 'Something went wrong while signing in. Please try again.';
}
