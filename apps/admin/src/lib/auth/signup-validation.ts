export type SignupField = "storeName" | "name" | "email" | "password";

export type SignupFieldErrors = Partial<Record<SignupField, string>>;

export interface SignupFormValues {
  storeName: string;
  name: string;
  email: string;
  password: string;
  timezone: string;
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a digit";
  return null;
}

export function validateSignupForm(values: SignupFormValues): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  if (!values.storeName.trim()) errors.storeName = "Store name is required";
  if (!values.name.trim()) errors.name = "Your name is required";

  const email = values.email.trim();
  if (!email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address";
  }

  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  return errors;
}

export function mapSignupApiError(err: unknown): { fieldErrors: SignupFieldErrors; formError?: string } {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : "Signup failed";

  if (code === "EMAIL_EXISTS" || /email/i.test(message)) {
    return { fieldErrors: { email: message } };
  }

  if (/password/i.test(message)) {
    return { fieldErrors: { password: message } };
  }

  return { formError: message };
}
