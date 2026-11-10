import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useCustomerAuth } from "@/auth/customer-auth";
import "./account.css";

type Language = "en" | "ar";
const t = (lang: Language, en: string, ar: string) => lang === "ar" ? ar : en;

export default function AccountPage({ lang }: { lang: Language }) {
  const { configured, loading, user, signIn, signUp, signOut } = useCustomerAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim() || !password) {
      setError(t(lang, "Enter your email and password.", "أدخل بريدك الإلكتروني وكلمة المرور."));
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError(t(lang, "Choose a password with at least 8 characters.", "اختر كلمة مرور من ٨ أحرف على الأقل."));
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError(t(lang, "Your passwords don’t match.", "كلمتا المرور غير متطابقتين."));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { confirmationRequired } = await signUp(email.trim(), password);
        setPassword("");
        setConfirmPassword("");
        setNotice(confirmationRequired
          ? t(lang, "Account created. Check your inbox for a confirmation link, then sign in.", "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لفتح رابط التأكيد، ثم سجّل الدخول.")
          : t(lang, "Your account is ready. You’re signed in on this device.", "حسابك جاهز. تم تسجيل دخولك على هذا الجهاز."));
      } else {
        await signIn(email.trim(), password);
        setPassword("");
        setNotice(t(lang, "You’re signed in. We’ll keep you signed in on this device.", "تم تسجيل الدخول. سنبقيك مسجلاً على هذا الجهاز."));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/invalid login credentials|invalid email or password/i.test(message)) {
        setError(t(lang, "That email and password don’t match an account.", "البريد الإلكتروني أو كلمة المرور غير صحيحة."));
      } else if (/email not confirmed/i.test(message)) {
        setError(t(lang, "Confirm your email before signing in.", "أكد بريدك الإلكتروني قبل تسجيل الدخول."));
      } else if (/rate limit|too many requests/i.test(message)) {
        setError(t(lang, "Too many attempts. Please wait a little and try again.", "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً."));
      } else if (mode === "signup" && /redirect.*not allowed|redirect.*allow/i.test(message)) {
        setError(t(lang, "Sign-up needs an approved confirmation URL. Please contact the shop team.", "يحتاج إنشاء الحساب إلى رابط تأكيد معتمد. يرجى التواصل مع فريق المتجر."));
      } else if (mode === "signup") {
        setError(t(lang, "We couldn’t create an account with those details. If you already have an account, sign in instead.", "تعذر إنشاء حساب بهذه البيانات. إذا كان لديك حساب بالفعل، سجّل الدخول."));
      } else {
        setError(t(lang, "Sign-in is temporarily unavailable. Please try again.", "تسجيل الدخول غير متاح مؤقتاً. حاول مجدداً."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    setError("");
    try {
      await signOut();
      setNotice(t(lang, "You’re signed out.", "تم تسجيل خروجك."));
    } catch {
      setError(t(lang, "We couldn’t sign you out. Please try again.", "تعذر تسجيل خروجك. حاول مجدداً."));
    }
  };

  return <main className="account-page">
    <section className="account-card" aria-labelledby="account-title" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="account-mark" aria-hidden="true"><UserRound size={23} /></div>
      {loading ? <>
        <h1 id="account-title">{t(lang, "Checking your account", "جارٍ التحقق من حسابك")}</h1>
        <p className="account-muted" role="status">{t(lang, "One moment…", "لحظة واحدة…")}</p>
      </> : user ? <>
        <p className="account-eyebrow">{t(lang, "YOUR TAWWA ACCOUNT", "حساب توّا")}</p>
        <h1 id="account-title">{t(lang, "Welcome back.", "أهلاً بعودتك.")}</h1>
        <p className="account-muted">{t(lang, "You’re signed in as", "تم تسجيل الدخول باسم")} <strong dir="ltr">{user.email}</strong></p>
        <p className="account-persist">{t(lang, "Your account stays signed in on this device.", "سيبقى حسابك مسجلاً على هذا الجهاز.")}</p>
        {notice && <p className="account-notice" role="status">{notice}</p>}
        <button className="button account-submit" type="button" onClick={() => void logout()}>
          {t(lang, "Sign out", "تسجيل الخروج")}
        </button>
      </> : <>
        <p className="account-eyebrow">{t(lang, "YOUR TAWWA ACCOUNT", "حساب توّا")}</p>
        <h1 id="account-title">{mode === "signup" ? t(lang, "Create an account.", "أنشئ حساباً.") : t(lang, "Sign in.", "سجّل الدخول.")}</h1>
        <p className="account-muted">{mode === "signup"
          ? t(lang, "Create your Tawwa account with your email. We’ll keep you signed in on this device.", "أنشئ حساب توّا باستخدام بريدك الإلكتروني. سنبقيك مسجلاً على هذا الجهاز.")
          : t(lang, "Use your existing Tawwa account. Your session will stay on this device.", "استخدم حساب توّا الحالي. سيبقى تسجيل دخولك على هذا الجهاز.")}</p>
        {!configured ? <p className="account-alert" role="alert">{t(lang, "Account sign-in is not configured yet.", "تسجيل الدخول غير مُعدّ حالياً.")}</p> : <form className="account-form" onSubmit={submit}>
          {error && <p className="account-alert" role="alert">{error}</p>}
          <label className="account-label">
            <span>{t(lang, "Email", "البريد الإلكتروني")}</span>
            <span className="account-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" name="email" autoComplete="email" inputMode="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} required /></span>
          </label>
          <label className="account-label">
            <span>{t(lang, "Password", "كلمة المرور")}</span>
            <span className="account-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required />
              <button className="account-show-password" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? t(lang, "Hide password", "إخفاء كلمة المرور") : t(lang, "Show password", "إظهار كلمة المرور")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          {mode === "signup" && <label className="account-label">
            <span>{t(lang, "Confirm password", "تأكيد كلمة المرور")}</span>
            <span className="account-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} name="confirmPassword" autoComplete="new-password" minLength={8} dir="ltr" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
            </span>
          </label>}
          <button className="button account-submit" type="submit" disabled={submitting}>
            {submitting
              ? mode === "signup" ? t(lang, "Creating account…", "جارٍ إنشاء الحساب…") : t(lang, "Signing in…", "جارٍ تسجيل الدخول…")
              : mode === "signup" ? t(lang, "Create account", "إنشاء حساب") : t(lang, "Sign in", "تسجيل الدخول")}
          </button>
          {notice && <p className="account-notice" role="status">{notice}</p>}
          <p className="account-mode-switch">
            {mode === "signup"
              ? t(lang, "Already have an account?", "لديك حساب بالفعل؟")
              : t(lang, "New to Tawwa?", "جديد في توّا؟")}
            <button type="button" onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setPassword("");
              setConfirmPassword("");
              setError("");
              setNotice("");
            }}>
              {mode === "signup" ? t(lang, "Sign in", "تسجيل الدخول") : t(lang, "Create an account", "إنشاء حساب")}
            </button>
          </p>
        </form>}
      </>}
    </section>
  </main>;
}
