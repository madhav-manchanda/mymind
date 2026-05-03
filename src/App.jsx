import { useState, useEffect } from 'react';
import { isConfigured, signIn, signUp, signOut, onAuthStateChange, getSession, getSupabase } from './supabaseService';
import MindApp from './MindApp';
import { Brain, Eye, EyeOff, Mail, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forceAuth, setForceAuth] = useState(false);
  const configured = isConfigured();
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    getSession().then(s => {
      if (s?.user) setUser(s.user);
      setLoading(false);
    });
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  const handleSignOut = async () => {
    try { await signOut(); } catch (err) { console.error(err); }
    setUser(null);
  };
  if (loading) return (
    <div className="config-screen">
      <div style={{ textAlign: 'center', color: 'white' }}>
        <Brain size={48} style={{ animation: 'spin 3s linear infinite' }} />
        <p style={{ marginTop: 16, fontSize: 16 }}>Loading Vivyn...</p>
      </div>
    </div>
  );
  if (!configured) return (
    <div className="config-screen">
      <div className="config-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Brain size={32} color="#7c5cfc" />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Vivyn Setup</h1>
            <p style={{ margin: 0, color: 'var(--text2)', fontSize: 14 }}>Configure your Supabase credentials</p>
          </div>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text2)' }}>
          Open the <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>.env</code> file in the project root and set:
        </p>
        <pre style={{ background: 'var(--bg3)', padding: 16, borderRadius: 8, fontSize: 13, overflow: 'auto', margin: '16px 0' }}>
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
        </pre>
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>
          Then restart the dev server with <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>npm run dev</code>
        </p>
      </div>
    </div>
  );
  if (!user || forceAuth) return <AuthScreen forceAuth={forceAuth} setForceAuth={setForceAuth} />;
  return <MindApp user={user} onSignOut={handleSignOut} />;
}
const InfoBanner = ({ text }) => text ? (
  <div style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '12px 16px',
    borderRadius: 10, fontSize: 13, marginBottom: 16, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    <Mail size={16} style={{ flexShrink: 0, marginTop: 2 }} />{text}
  </div>
) : null;
const OtpField = ({ id = 'otp', value, onChange }) => (
  <div className="auth-field">
    <label htmlFor={id}>Verification Code</label>
    <input id={id} type="text" placeholder="Enter 6-digit code"
      value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} maxLength={6} autoFocus
      autoComplete="one-time-code"
      style={{ textAlign: 'center', fontSize: 22, letterSpacing: 10, fontWeight: 600 }} />
  </div>
);
const PasswordField = ({ id, label, value, onChange, show, onToggle, err, placeholder = '••••••••' }) => (
  <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-input-wrap">
      <input id={id} type={show ? 'text' : 'password'} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)}
        className={err ? 'error' : ''} />
      <button type="button" className="auth-eye-btn" onClick={onToggle} tabIndex={-1}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
    {err && <div className="auth-error-text">{err}</div>}
  </div>
);
function AuthScreen({ forceAuth, setForceAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [otp, setOtp] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [formKey, setFormKey] = useState(0);
  const switchMode = (m) => {
    setMode(m); setError(''); setFieldErrors({}); setMessage(''); setOtp('');
    setFormKey(k => k + 1);
  };
  const validate = () => {
    const errs = {};
    if (!email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (mode === 'signup') {
      if (!confirmPw) errs.confirmPw = 'Please confirm your password';
      else if (password !== confirmPw) errs.confirmPw = 'Passwords do not match';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        const data = await signUp(email, password);
        if (data.user && !data.session) {
          setMode('verify');
          setMessage(`We sent a verification code to ${email}. Check your inbox.`);
        }
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const sb = getSupabase();
      const { error: verifyError } = await sb.auth.verifyOtp({ email, token: otp, type: 'signup' });
      if (verifyError) throw verifyError;
      setMessage('Email verified! Logging you in...');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };
  const handleResend = async (type = 'signup') => {
    setError('');
    try {
      const sb = getSupabase();
      if (type === 'recovery') {
        const { error } = await sb.auth.resetPasswordForEmail(email);
        if (error) throw error;
      } else {
        const { error } = await sb.auth.resend({ type, email });
        if (error) throw error;
      }
      setMessage('Code resent! Check your inbox.');
    } catch (err) { setError(err.message); }
  };
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!email) { setFieldErrors({ email: 'Enter your email' }); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setFieldErrors({ email: 'Enter a valid email' }); return; }
    setLoading(true); setError('');
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMode('reset-code');
      setMessage(`We sent a password reset code to ${email}. Check your inbox.`);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };
  const handleResetCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      setForceAuth(true);
      const sb = getSupabase();
      const { error: verifyError } = await sb.auth.verifyOtp({ email, token: otp, type: 'recovery' });
      if (verifyError) throw verifyError;
      setMode('reset-password');
      setMessage('Code verified! Set your new password below.');
      setOtp('');
    } catch (err) { setError(err.message); setForceAuth(false); }
    setLoading(false);
  };
  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!newPw) errs.newPw = 'Password is required';
    else if (newPw.length < 6) errs.newPw = 'Must be at least 6 characters';
    if (!confirmNewPw) errs.confirmNewPw = 'Please confirm your password';
    else if (newPw !== confirmNewPw) errs.confirmNewPw = 'Passwords do not match';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true); setError('');
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.updateUser({ password: newPw });
      if (error) throw error;
      await sb.auth.signOut();
      setForceAuth(false);
      setMessage('Password updated! You can now sign in with your new password.');
      setNewPw(''); setConfirmNewPw('');
      setTimeout(() => switchMode('login'), 2500);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };
  if (mode === 'verify') return (
    <div className="auth-screen"><div className="auth-card">
      <div className="auth-logo-badge"><Mail size={28} color="white" /></div>
      <div className="auth-title">Verify Your Email</div>
      <div className="auth-tagline">Enter the 6-digit code sent to your email.</div>
      <InfoBanner text={message} />
      <form onSubmit={handleVerifyOtp}>
        <OtpField value={otp} onChange={setOtp} />
        {error && <div className="auth-error-banner">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading || otp.length < 6}>
          {loading ? <div className="auth-spinner" /> : 'Verify Email'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => switchMode('signup')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => handleResend('signup')} style={{ fontSize: 13 }}>
            Resend Code
          </button>
        </div>
      </form>
    </div></div>
  );
  if (mode === 'forgot') return (
    <div className="auth-screen"><div className="auth-card">
      <div className="auth-logo-badge"><KeyRound size={28} color="white" /></div>
      <div className="auth-title">Reset Password</div>
      <div className="auth-tagline">We'll send a reset code to your email.</div>
      <form onSubmit={handleForgotSubmit} className="auth-form-enter">
        {error && <div className="auth-error-banner">{error}</div>}
        <div className="auth-field">
          <label htmlFor="reset-email">Email Address</label>
          <div className="auth-input-wrap">
            <input id="reset-email" type="email" placeholder="you@example.com"
              value={email} onChange={e => { setEmail(e.target.value); setFieldErrors({}); }}
              className={fieldErrors.email ? 'error' : ''} autoFocus />
          </div>
          {fieldErrors.email && <div className="auth-error-text">{fieldErrors.email}</div>}
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? <div className="auth-spinner" /> : 'Send Reset Code'}
        </button>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => switchMode('login')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ArrowLeft size={14} /> Back to Sign In
          </button>
        </div>
      </form>
    </div></div>
  );
  if (mode === 'reset-code') return (
    <div className="auth-screen"><div className="auth-card">
      <div className="auth-logo-badge"><ShieldCheck size={28} color="white" /></div>
      <div className="auth-title">Enter Reset Code</div>
      <div className="auth-tagline">Check your email for the 6-digit code.</div>
      <InfoBanner text={message} />
      <form onSubmit={handleResetCodeSubmit}>
        <OtpField id="reset-otp" value={otp} onChange={setOtp} />
        {error && <div className="auth-error-banner">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading || otp.length < 6}>
          {loading ? <div className="auth-spinner" /> : 'Verify Code'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => { setForceAuth(false); switchMode('forgot'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => handleResend('recovery')} style={{ fontSize: 13 }}>
            Resend Code
          </button>
        </div>
      </form>
    </div></div>
  );
  if (mode === 'reset-password') return (
    <div className="auth-screen"><div className="auth-card">
      <div className="auth-logo-badge"><KeyRound size={28} color="white" /></div>
      <div className="auth-title">New Password</div>
      <div className="auth-tagline">Choose a strong password for your account.</div>
      <InfoBanner text={message} />
      <form onSubmit={handleNewPasswordSubmit} className="auth-form-enter">
        {error && <div className="auth-error-banner">{error}</div>}
        <PasswordField id="newPw" label="New Password" value={newPw}
          onChange={v => { setNewPw(v); setFieldErrors(f => ({ ...f, newPw: '' })); }}
          show={showNewPw} onToggle={() => setShowNewPw(!showNewPw)} err={fieldErrors.newPw} />
        <PasswordField id="confirmNewPw" label="Confirm New Password" value={confirmNewPw}
          onChange={v => { setConfirmNewPw(v); setFieldErrors(f => ({ ...f, confirmNewPw: '' })); }}
          show={showNewPw} onToggle={() => setShowNewPw(!showNewPw)} err={fieldErrors.confirmNewPw} />
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? <div className="auth-spinner" /> : 'Update Password'}
        </button>
      </form>
    </div></div>
  );
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-badge"><Brain size={28} color="white" /></div>
        <div className="auth-title">Vivyn</div>
        <div className="auth-tagline">Your visual second brain</div>
        <div className="auth-tabs">
          <button type="button" className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}>Sign In</button>
          <button type="button" className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => switchMode('signup')}>Sign Up</button>
        </div>
        <form onSubmit={handleSubmit} key={formKey} className="auth-form-enter">
          {error && <div className="auth-error-banner">{error}</div>}
          {message && !error && (
            <div style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '10px 14px',
              borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{message}</div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <div className="auth-input-wrap">
              <input id="auth-email" type="email" placeholder="you@example.com"
                value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: '' })); }}
                className={fieldErrors.email ? 'error' : ''} autoFocus />
            </div>
            {fieldErrors.email && <div className="auth-error-text">{fieldErrors.email}</div>}
          </div>
          <PasswordField id="auth-pass" label="Password" value={password}
            onChange={v => { setPassword(v); setFieldErrors(f => ({ ...f, 'auth-pass': '' })); }}
            show={showPw} onToggle={() => setShowPw(!showPw)} err={fieldErrors.password} />
          {mode === 'signup' && (
            <PasswordField id="auth-confirm" label="Confirm Password" value={confirmPw}
              onChange={v => { setConfirmPw(v); setFieldErrors(f => ({ ...f, 'auth-confirm': '' })); }}
              show={showConfirmPw} onToggle={() => setShowConfirmPw(!showConfirmPw)} err={fieldErrors.confirmPw} />
          )}
          {mode === 'login' && (
            <button type="button" className="auth-forgot" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <div className="auth-spinner" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
          {mode === 'signup' && (
            <p className="auth-signup-note">
              You'll receive a verification code on your email after signing up.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
