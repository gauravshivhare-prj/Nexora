import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { FormAlert } from '../components/FormAlert.jsx';
import { FormField } from '../components/FormField.jsx';
import { SubmitButton } from '../components/SubmitButton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import {
  PASSWORD_HINT,
  collectErrors,
  validateEmail,
  validateName,
  validateNewPassword,
  validatePasswordConfirmation,
} from '../utils/authValidation.js';

const EMPTY_FORM = { name: '', email: '', password: '', confirmPassword: '' };

export function RegisterPage() {
  const { register, isAuthenticated, isRestoring } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/app" replace />;

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  /** Validates one field on blur, so problems surface before submitting. */
  const validateOnBlur = (field, check) => () => {
    const message = check();
    if (message) setFieldErrors((current) => ({ ...current, [field]: message }));
  };

  function validateAll() {
    return collectErrors({
      name: () => validateName(values.name),
      email: () => validateEmail(values.email),
      password: () => validateNewPassword(values.password),
      confirmPassword: () => validatePasswordConfirmation(values.password, values.confirmPassword),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validateAll();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      navigate('/app', { replace: true });
    } catch (error) {
      applyFailure(error, { setFieldErrors, setFormError });
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start turning your profile into career readiness."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <FormAlert message={formError} />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Full name"
          value={values.name}
          onChange={setField('name')}
          onBlur={validateOnBlur('name', () => validateName(values.name))}
          error={fieldErrors.name}
          autoComplete="name"
          disabled={isSubmitting || isRestoring}
          placeholder="Gaurav Shivhare"
        />

        <FormField
          label="Email"
          type="email"
          value={values.email}
          onChange={setField('email')}
          onBlur={validateOnBlur('email', () => validateEmail(values.email))}
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
          onBlur={validateOnBlur('password', () => validateNewPassword(values.password))}
          error={fieldErrors.password}
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          disabled={isSubmitting || isRestoring}
        />

        <FormField
          label="Confirm password"
          type="password"
          value={values.confirmPassword}
          onChange={setField('confirmPassword')}
          onBlur={validateOnBlur('confirmPassword', () =>
            validatePasswordConfirmation(values.password, values.confirmPassword),
          )}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          disabled={isSubmitting || isRestoring}
        />

        <div className="mt-2">
          <SubmitButton isSubmitting={isSubmitting} busyLabel="Creating your account…">
            Create account
          </SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}

/**
 * Routes a failure to the right place: a field-specific problem onto that
 * field, anything else onto the form-level alert.
 */
function applyFailure(error, { setFieldErrors, setFormError }) {
  if (!(error instanceof ApiRequestError)) {
    console.error('Unexpected registration failure:', error);
    setFormError('Something went wrong while creating your account. Please try again.');
    return;
  }

  // The email is taken. Attaching this to the email field is far clearer
  // than a banner, and points at what needs changing.
  if (error.status === 409) {
    setFieldErrors((current) => ({
      ...current,
      email: 'An account with this email already exists.',
    }));
    return;
  }

  // The server validated differently from us — its per-field detail wins.
  if (error.status === 400 && error.details?.length) {
    const serverErrors = Object.fromEntries(
      error.details
        .filter((detail) => detail.field)
        .map((detail) => [detail.field, detail.message]),
    );

    if (Object.keys(serverErrors).length > 0) {
      setFieldErrors((current) => ({ ...current, ...serverErrors }));
      return;
    }
  }

  if (error.status !== null && error.status >= 500) {
    setFormError('Nexora is having trouble right now. Please try again in a moment.');
    return;
  }

  setFormError(error.message);
}
