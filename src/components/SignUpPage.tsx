import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Joi from "joi";
import { signup } from "../api/auth";
import { AuthShell, authButtonClass, authInputClass } from "./AuthShell";

// tlds must be disabled in the browser build of joi (no TLD data bundled).
const signupSchema = Joi.object({
  name: Joi.string().trim().max(100).required().messages({
    "string.empty": "Please tell us your name",
    "string.max": "Name must be at most 100 characters",
  }),
  email: Joi.string()
    .trim()
    .email({ tlds: false })
    .required()
    .messages({
      "string.empty": "Please enter your email",
      "string.email": "Please enter a valid email address",
    }),
  password: Joi.string().min(8).max(128).required().messages({
    "string.empty": "Please choose a password",
    "string.min": "Password must be at least 8 characters",
    "string.max": "Password must be at most 128 characters",
  }),
  confirm: Joi.any().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
  }),
});

/** Standalone create-account page, mirroring the sign-in design from UI.pen. */
export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const { error: validationError, value } = signupSchema.validate(
      { name, email, password, confirm },
      { abortEarly: true },
    );
    if (validationError) {
      setError(validationError.details[0].message);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signup(value.name, value.email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Make a cozy home for everything you own.">
      <form className="flex w-full max-w-[400px] flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Name</span>
          <input
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputClass}
          />
        </label>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </label>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </label>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Confirm password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={authInputClass}
          />
        </label>
        {error && (
          <p className="text-center font-body text-sm text-cute-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Creating account…" : "Create Account"}
        </button>
      </form>
      <p className="font-body text-sm text-cute-text-muted">
        Already have an account?{" "}
        <Link to="/signin" className="font-semibold text-cute-primary">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
