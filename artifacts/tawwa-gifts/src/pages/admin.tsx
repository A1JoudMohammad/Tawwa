import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, Award, Check, Eye, EyeOff, Gift, Heart, LoaderCircle, LogOut, Moon, Pencil, Plus, Sparkles, Sun, X } from 'lucide-react';
import {
  useGetAdminSession, useGetAdminCatalog, getGetAdminSessionQueryKey, getGetAdminCatalogQueryKey, getGetCatalogQueryKey,
  loginAdmin, logoutAdmin, createAdminProduct, updateAdminProduct, createAdminOccasion, updateAdminOccasion,
  AdminOccasionIcon,
} from '@workspace/api-client-react';
import type { AdminProduct, AdminOccasion, StaffSession } from '@workspace/api-client-react';
import '../admin.css';

const ADMIN_HEADERS = { headers: { 'X-Tawwa-Admin': '1' } };
const productImg = (id: string) => `${import.meta.env.BASE_URL}images/products/${id === 'birthday-bright' ? 'birthday-brights' : id}.jpg`;
const errStatus = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
const errMessage = (e: unknown, fallback = 'Something went wrong. Please try again.') => {
  if (e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data: unknown }).data;
    if (d && typeof d === 'object' && 'error' in d && typeof (d as { error: unknown }).error === 'string') return (d as { error: string }).error;
  }
  return fallback;
};
const isAuthError = (e: unknown) => errStatus(e) === 401 || errStatus(e) === 403;

function useAdminMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Staff catalog editor | Tawwa';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    const prev = meta.content;
    meta.content = 'noindex, nofollow';
    return () => { document.title = prevTitle; if (created) meta?.remove(); else if (meta) meta.content = prev; };
  }, []);
}

type Notice = { kind: 'ok' | 'err'; text: string } | null;

export default function AdminPage() {
  useAdminMeta();
  const qc = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);
  const session = useGetAdminSession({ query: { queryKey: getGetAdminSessionQueryKey(), retry: false } });
  const s = session.data;

  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(null), 4200); return () => window.clearTimeout(id); }, [notice]);

  const signOutLocal = (msg: string | null) => {
    qc.removeQueries({ queryKey: getGetAdminCatalogQueryKey() });
    qc.setQueryData<StaffSession>(getGetAdminSessionQueryKey(), old => ({ configured: old?.configured ?? true, authenticated: false }));
    setExpiredMsg(msg);
  };
  const handleAuthError = (e: unknown) => {
    if (!isAuthError(e)) return false;
    signOutLocal(errStatus(e) === 403 ? errMessage(e, 'This account does not have staff access.') : 'Your session ended. Please sign in again.');
    return true;
  };

  let body: ReactNode;
  if (session.isLoading) body = <div className="adm-center" aria-busy="true"><div className="adm-skel adm-skel-card" /><p className="adm-muted">Checking your session</p></div>;
  else if (session.isError) body = <StateCard tone="err" title="We could not reach the staff service" text={errMessage(session.error, 'The admin service did not respond.')} action={<button className="adm-btn" onClick={() => session.refetch()} data-testid="button-retry-session">Try again</button>} />;
  else if (s && !s.configured) body = <StateCard tone="warn" title="Staff sign-in is not set up yet" text="Supabase authentication has not been configured for this shop. A developer needs to add the Supabase project settings before staff can sign in." />;
  else if (s && !s.authenticated) body = <SignIn notice={expiredMsg} onSignedIn={() => { setExpiredMsg(null); setNotice({ kind: 'ok', text: 'Signed in. Welcome back.' }); }} />;
  else body = <Editor onAuthError={handleAuthError} notify={setNotice} onSignOut={() => signOutLocal(null)} />;

  return <div className="adm" data-testid="page-admin">
    <header className="adm-top">
      <div className="adm-top-inner">
        <div className="adm-brand"><span className="adm-brand-mark" aria-hidden="true"><Gift size={18} /></span><span><strong>Tawwa</strong> <span className="adm-brand-sub">Staff catalog</span></span></div>
        <Link href="/" className="adm-link" data-testid="link-storefront"><ArrowLeft size={16} /> Back to storefront</Link>
      </div>
    </header>
    <main className="adm-main">{body}</main>
    <div className="adm-toast-region" role="status" aria-live="polite">
      {notice && <div className={`adm-toast ${notice.kind}`} data-testid="status-admin-notice">{notice.kind === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{notice.text}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={14} /></button></div>}
    </div>
  </div>;
}

function StateCard({ tone, title, text, action }: { tone: 'err' | 'warn'; title: string; text: string; action?: ReactNode }) {
  return <div className="adm-center"><section className={`adm-state ${tone}`} data-testid={`state-${tone}`}><AlertTriangle size={22} aria-hidden="true" /><h1>{title}</h1><p>{text}</p>{action}</section></div>;
}

function SignIn({ notice, onSignedIn }: { notice: string | null; onSignedIn: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: (data: { email: string; password: string }) => loginAdmin(data, ADMIN_HEADERS),
    onSuccess: session => {
      qc.setQueryData(getGetAdminSessionQueryKey(), session);
      if (session.authenticated) onSignedIn(); else setError('Sign-in did not complete. Please try again.');
    },
    onError: e => setError(errStatus(e) === 401 ? 'That email and password do not match a staff account.' : errMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Enter your staff email and password.'); return; }
    login.mutate({ email: email.trim(), password });
  };
  return <div className="adm-center">
    <form className="adm-signin" onSubmit={submit} noValidate>
      <div className="adm-eyebrow">Staff only</div>
      <h1>Sign in to edit the catalog</h1>
      <p className="adm-muted">Use the staff account your manager set up for you. There is no public sign-up.</p>
      {notice && <div className="adm-alert warn" role="alert" data-testid="text-session-notice">{notice}</div>}
      {error && <div className="adm-alert err" role="alert" data-testid="text-login-error">{error}</div>}
      <label className="adm-field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required data-testid="input-email" /></label>
      <label className="adm-field"><span>Password</span>
        <span className="adm-pw"><input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="input-password" />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} data-testid="button-toggle-password">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
      </label>
      <button className="adm-btn wide" type="submit" disabled={login.isPending} data-testid="button-sign-in">{login.isPending ? <><LoaderCircle className="adm-spin" size={16} /> Signing in</> : 'Sign in'}</button>
    </form>
  </div>;
}

const iconOf = (icon: string, size = 16) => {
  const p = { size, 'aria-hidden': true } as const;
  if (icon === 'heart') return <Heart {...p} />;
  if (icon === 'sparkles') return <Sparkles {...p} />;
  if (icon === 'sun') return <Sun {...p} />;
  if (icon === 'award') return <Award {...p} />;
  if (icon === 'moon') return <Moon {...p} />;
  if (icon === 'rings') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="14" r="5" /><circle cx="15" cy="14" r="5" /><path d="M10 6l2-3 2 3" /></svg>;
  return <Gift {...p} />;
};

type Editing = { kind: 'product'; item: AdminProduct | null } | { kind: 'occasion'; item: AdminOccasion | null } | null;
type Confirm = { title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null;

function Editor({ onAuthError, notify, onSignOut }: { onAuthError: (e: unknown) => boolean; notify: (n: Notice) => void; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'products' | 'occasions'>('products');
  const [editing, setEditing] = useState<Editing>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const catalog = useGetAdminCatalog({ query: { queryKey: getGetAdminCatalogQueryKey(), retry: (n, e) => !isAuthError(e) && n < 2 } });
  const authRef = useRef(onAuthError); authRef.current = onAuthError;
  useEffect(() => { if (catalog.error) authRef.current(catalog.error); }, [catalog.error]);

  const products = useMemo(() => [...(catalog.data?.products ?? [])].sort((a, b) => a.display_order - b.display_order || a.name_en.localeCompare(b.name_en)), [catalog.data]);
  const occasions = useMemo(() => [...(catalog.data?.occasions ?? [])].sort((a, b) => a.display_order - b.display_order || a.name_en.localeCompare(b.name_en)), [catalog.data]);
  const occById = useMemo(() => new Map(occasions.map(o => [o.id, o])), [occasions]);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() }), qc.invalidateQueries({ queryKey: getGetCatalogQueryKey() })]);
  };
  const logout = useMutation({
    mutationFn: () => logoutAdmin(ADMIN_HEADERS),
    onSuccess: () => { onSignOut(); notify({ kind: 'ok', text: 'Signed out.' }); },
    onError: () => notify({ kind: 'err', text: 'Sign-out could not be confirmed. Please try again.' }),
  });

  const toggleProduct = async (p: AdminProduct) => {
    setBusyId(p.id);
    try {
      await updateAdminProduct(p.id, { ...p, is_available: !p.is_available }, ADMIN_HEADERS);
      await refresh();
      notify({ kind: 'ok', text: `${p.name_en} is now ${p.is_available ? 'hidden from' : 'live on'} the storefront.` });
    } catch (e) { if (!onAuthError(e)) notify({ kind: 'err', text: errMessage(e) }); }
    finally { setBusyId(null); }
  };
  const toggleOccasion = async (o: AdminOccasion) => {
    setBusyId(o.id);
    try {
      await updateAdminOccasion(o.id, { ...o, is_active: !o.is_active }, ADMIN_HEADERS);
      await refresh();
      notify({ kind: 'ok', text: `${o.name_en} is now ${o.is_active ? 'disabled' : 'active'}.` });
    } catch (e) { if (!onAuthError(e)) notify({ kind: 'err', text: errMessage(e) }); }
    finally { setBusyId(null); }
  };
  const askProduct = (p: AdminProduct) => {
    if (p.is_available) setConfirm({ title: `Disable ${p.name_en}?`, text: 'Customers will no longer see or order this gift. You can re-enable it at any time.', confirmLabel: 'Disable gift', danger: true, onConfirm: () => toggleProduct(p) });
    else if (!occById.get(p.occasion_id)?.is_active) notify({ kind: 'err', text: `Enable the "${occById.get(p.occasion_id)?.name_en ?? p.occasion_id}" occasion first. Gifts cannot go live under a disabled occasion.` });
    else toggleProduct(p);
  };
  const askOccasion = (o: AdminOccasion) => {
    if (!o.is_active) { toggleOccasion(o); return; }
    const count = products.filter(p => p.occasion_id === o.id && p.is_available).length;
    setConfirm({ title: `Disable ${o.name_en}?`, text: `This occasion will disappear from the storefront${count ? `, and its ${count} available gift${count === 1 ? '' : 's'} will be hidden with it` : ''}. Gift settings are kept, so re-enabling brings everything back.`, confirmLabel: 'Disable occasion', danger: true, onConfirm: () => toggleOccasion(o) });
  };

  const live = { products: products.filter(p => p.is_available && occById.get(p.occasion_id)?.is_active).length, occasions: occasions.filter(o => o.is_active).length };

  return <div className="adm-wrap">
    <div className="adm-head">
      <div><div className="adm-eyebrow">Catalog editor</div><h1>What customers can order today</h1>
        {catalog.data && <p className="adm-muted" data-testid="text-catalog-summary">{live.products} of {products.length} gifts live, across {live.occasions} of {occasions.length} occasions.</p>}</div>
      <button className="adm-btn ghost" onClick={() => logout.mutate()} disabled={logout.isPending} data-testid="button-sign-out"><LogOut size={16} /> Sign out</button>
    </div>
    <div className="adm-bar">
      <div className="adm-tabs" role="tablist" aria-label="Catalog sections">
        {(['products', 'occasions'] as const).map(k => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{k === 'products' ? 'Gifts' : 'Occasions'} <span>{k === 'products' ? products.length : occasions.length}</span></button>)}
      </div>
      <button className="adm-btn" disabled={!catalog.data || (tab === 'products' && occasions.length === 0)} onClick={() => setEditing(tab === 'products' ? { kind: 'product', item: null } : { kind: 'occasion', item: null })} data-testid={`button-new-${tab}`}><Plus size={16} /> {tab === 'products' ? 'New gift' : 'New occasion'}</button>
    </div>

    {catalog.isLoading ? <div className="adm-list" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="adm-skel adm-skel-row" />)}</div>
      : catalog.isError ? (isAuthError(catalog.error) ? null : <StateCard tone="err" title="The catalog did not load" text={errMessage(catalog.error)} action={<button className="adm-btn" onClick={() => catalog.refetch()} data-testid="button-retry-catalog">Try again</button>} />)
      : tab === 'products' ? (products.length === 0 ? <Empty text={occasions.length ? 'No gifts yet. Add the first box customers can order.' : 'Create an occasion first, then add gifts to it.'} /> :
        <ul className="adm-list" data-testid="list-products">{products.map(p => {
          const occ = occById.get(p.occasion_id);
          const hiddenByOcc = p.is_available && occ && !occ.is_active;
          return <li key={p.id} className={`adm-row ${p.is_available ? '' : 'off'}`} data-testid={`row-product-${p.id}`}>
            <Thumb id={p.id} />
            <div className="adm-row-main"><div className="adm-row-title"><strong>{p.name_en}</strong><span dir="rtl" lang="ar" className="adm-ar">{p.name_ar}</span></div>
              <div className="adm-row-meta"><code>{p.id}</code><span>{occ?.name_en ?? p.occasion_id}</span>{p.age_group && <span>{p.age_group}</span>}<span>Order {p.display_order}</span></div></div>
            <div className="adm-price">{p.price.toFixed(3)} <small>KWD</small></div>
            <Status on={p.is_available} warn={hiddenByOcc ? 'Hidden: occasion disabled' : undefined} />
            <div className="adm-actions">
              <button className="adm-btn ghost sm" onClick={() => setEditing({ kind: 'product', item: p })} aria-label={`Edit ${p.name_en}`} data-testid={`button-edit-product-${p.id}`}><Pencil size={14} /> Edit</button>
              <button className="adm-btn ghost sm" disabled={busyId === p.id} onClick={() => askProduct(p)} data-testid={`button-toggle-product-${p.id}`}>{busyId === p.id ? <LoaderCircle className="adm-spin" size={14} /> : null}{p.is_available ? 'Disable' : 'Re-enable'}</button>
            </div>
          </li>;
        })}</ul>)
      : (occasions.length === 0 ? <Empty text="No occasions yet. Occasions group gifts on the storefront." /> :
        <ul className="adm-list" data-testid="list-occasions">{occasions.map(o => {
          const count = products.filter(p => p.occasion_id === o.id).length;
          return <li key={o.id} className={`adm-row occ ${o.is_active ? '' : 'off'}`} data-testid={`row-occasion-${o.id}`}>
            <span className="adm-occ-icon">{iconOf(o.icon, 18)}</span>
            <div className="adm-row-main"><div className="adm-row-title"><strong>{o.name_en}</strong><span dir="rtl" lang="ar" className="adm-ar">{o.name_ar}</span></div>
              <div className="adm-row-meta"><code>{o.id}</code><span>{count} gift{count === 1 ? '' : 's'}</span><span>Order {o.display_order}</span></div></div>
            <Status on={o.is_active} />
            <div className="adm-actions">
              <button className="adm-btn ghost sm" onClick={() => setEditing({ kind: 'occasion', item: o })} aria-label={`Edit ${o.name_en}`} data-testid={`button-edit-occasion-${o.id}`}><Pencil size={14} /> Edit</button>
              <button className="adm-btn ghost sm" disabled={busyId === o.id} onClick={() => askOccasion(o)} data-testid={`button-toggle-occasion-${o.id}`}>{busyId === o.id ? <LoaderCircle className="adm-spin" size={14} /> : null}{o.is_active ? 'Disable' : 'Re-enable'}</button>
            </div>
          </li>;
        })}</ul>)}

    {editing?.kind === 'product' && <ProductForm key={editing.item?.id ?? 'new'} initial={editing.item} occasions={occasions} existingIds={products.map(p => p.id)} onClose={() => setEditing(null)} onSaved={async saved => { await refresh(); setEditing(null); notify({ kind: 'ok', text: `Saved ${saved.name_en}.` }); }} onAuthError={onAuthError} askConfirm={setConfirm} />}
    {editing?.kind === 'occasion' && <OccasionForm key={editing.item?.id ?? 'new'} initial={editing.item} existingIds={occasions.map(o => o.id)} productCount={editing.item ? products.filter(p => p.occasion_id === editing.item?.id && p.is_available).length : 0} onClose={() => setEditing(null)} onSaved={async saved => { await refresh(); setEditing(null); notify({ kind: 'ok', text: `Saved ${saved.name_en}.` }); }} onAuthError={onAuthError} askConfirm={setConfirm} />}
    {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} onDone={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }} />}
  </div>;
}

function Thumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="adm-thumb">{failed ? <Gift size={18} aria-hidden="true" /> : <img src={productImg(id)} alt="" loading="lazy" onError={() => setFailed(true)} />}</span>;
}
function Status({ on, warn }: { on: boolean; warn?: string }) {
  return <span className={`adm-status ${warn ? 'warn' : on ? 'on' : 'off'}`}>{warn ?? (on ? 'Live' : 'Disabled')}</span>;
}
function Empty({ text }: { text: string }) {
  return <div className="adm-empty"><span aria-hidden="true"><Gift size={22} /></span><p>{text}</p></div>;
}

function ConfirmDialog({ title, text, confirmLabel, danger, onCancel, onDone }: NonNullable<Confirm> & { onCancel: () => void; onDone: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelRef.current(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const onCancelRef = useRef(onCancel); onCancelRef.current = onCancel;
  return <div className="adm-overlay top" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="adm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-text">
      <h2 id="adm-confirm-title">{title}</h2><p id="adm-confirm-text">{text}</p>
      <div className="adm-confirm-actions"><button ref={ref} className="adm-btn ghost" onClick={onCancel} data-testid="button-confirm-cancel">Keep as is</button><button className={`adm-btn ${danger ? 'danger' : ''}`} onClick={onDone} data-testid="button-confirm-ok">{confirmLabel}</button></div>
    </div>
  </div>;
}

/* ---------- Forms ---------- */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);
type Errors = Record<string, string>;

function Drawer({ title, sub, dirty, saving, error, onClose, onSubmit, askConfirm, children }: { title: string; sub: string; dirty: boolean; saving: boolean; error: string | null; onClose: () => void; onSubmit: (e: FormEvent) => void; askConfirm: (c: Confirm) => void; children: ReactNode }) {
  const tryClose = () => {
    if (saving) return;
    if (dirty) askConfirm({ title: 'Discard unsaved changes?', text: 'Your edits to this form have not been saved and will be lost.', confirmLabel: 'Discard changes', danger: true, onConfirm: onClose });
    else onClose();
  };
  const closeRef = useRef(tryClose); closeRef.current = tryClose;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.adm-confirm')) closeRef.current(); };
    const bu = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', k); window.addEventListener('beforeunload', bu);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('beforeunload', bu); document.body.style.overflow = ''; };
  }, []);
  return <div className="adm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) tryClose(); }}>
    <form className="adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-drawer-title" onSubmit={onSubmit} noValidate>
      <div className="adm-drawer-head"><div><div className="adm-eyebrow">{sub}</div><h2 id="adm-drawer-title">{title}</h2></div><button type="button" className="adm-x" onClick={tryClose} aria-label="Close form" data-testid="button-close-form"><X size={18} /></button></div>
      <div className="adm-drawer-body">{error && <div className="adm-alert err" role="alert" data-testid="text-form-error">{error}</div>}{children}</div>
      <div className="adm-drawer-foot"><span className="adm-muted small">{dirty ? 'Unsaved changes' : 'No changes yet'}</span><div><button type="button" className="adm-btn ghost" onClick={tryClose} disabled={saving} data-testid="button-cancel-form">Cancel</button><button type="submit" className="adm-btn" disabled={saving || !dirty} data-testid="button-save-form">{saving ? <><LoaderCircle className="adm-spin" size={16} /> Saving</> : 'Save'}</button></div></div>
    </form>
  </div>;
}

function F({ id, label, hint, error, ar, children }: { id: string; label: string; hint?: string; error?: string; ar?: boolean; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; dir?: 'rtl'; lang?: string }) => ReactNode }) {
  const desc = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return <div className={`adm-field ${error ? 'has-err' : ''}`}><label htmlFor={id}>{label}{ar && <span className="adm-tag">AR</span>}</label>
    {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': desc, ...(ar ? { dir: 'rtl' as const, lang: 'ar' } : {}) })}
    {hint && <small id={`${id}-hint`}>{hint}</small>}{error && <small id={`${id}-err`} className="err">{error}</small>}</div>;
}

type PState = { id: string; occasion_id: string; age_group: string; name_en: string; name_ar: string; description_en: string; description_ar: string; contents_en: string; contents_ar: string; price: string; ideal_for_en: string; ideal_for_ar: string; delivery_en: string; delivery_ar: string; is_available: boolean; display_order: string };
const toPState = (p: AdminProduct | null, firstOcc: string): PState => p ? { ...p, age_group: p.age_group ?? '', contents_en: p.contents_en.join('\n'), contents_ar: p.contents_ar.join('\n'), price: String(p.price), display_order: String(p.display_order) }
  : { id: '', occasion_id: firstOcc, age_group: '', name_en: '', name_ar: '', description_en: '', description_ar: '', contents_en: '', contents_ar: '', price: '', ideal_for_en: '', ideal_for_ar: '', delivery_en: '', delivery_ar: '', is_available: true, display_order: '0' };

function ProductForm({ initial, occasions, existingIds, onClose, onSaved, onAuthError, askConfirm }: { initial: AdminProduct | null; occasions: AdminOccasion[]; existingIds: string[]; onClose: () => void; onSaved: (p: AdminProduct) => Promise<void>; onAuthError: (e: unknown) => boolean; askConfirm: (c: Confirm) => void }) {
  const isNew = !initial;
  const start = useMemo(() => toPState(initial, occasions.find(o => o.is_active)?.id ?? occasions[0]?.id ?? ''), [initial, occasions]);
  const [v, setV] = useState<PState>(start);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const set = <K extends keyof PState>(k: K, val: PState[K]) => { setV(o => ({ ...o, [k]: val })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };
  const occ = occasions.find(o => o.id === v.occasion_id);

  const save = useMutation({
    mutationFn: (data: AdminProduct) => isNew ? createAdminProduct(data, ADMIN_HEADERS) : updateAdminProduct(initial.id, data, ADMIN_HEADERS),
    onSuccess: saved => onSaved(saved),
    onError: e => { if (!onAuthError(e)) setServerErr(errMessage(e, 'The gift could not be saved.')); },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault(); setServerErr(null);
    const er: Errors = {};
    const id = v.id.trim();
    if (isNew) { if (!SLUG.test(id)) er.id = 'Use lowercase letters, numbers and single hyphens, e.g. eid-sweets-box.'; else if (existingIds.includes(id)) er.id = 'Another gift already uses this ID.'; }
    for (const k of ['name_en', 'name_ar', 'description_en', 'description_ar', 'ideal_for_en', 'ideal_for_ar', 'delivery_en', 'delivery_ar'] as const) if (!v[k].trim()) er[k] = 'Required.';
    if (!occ) er.occasion_id = 'Choose an occasion.';
    const cEn = lines(v.contents_en), cAr = lines(v.contents_ar);
    if (!cEn.length) er.contents_en = 'Add at least one item.';
    if (!cAr.length) er.contents_ar = 'Add at least one item.';
    if (cEn.length && cAr.length && cEn.length !== cAr.length) er.contents_ar = `English has ${cEn.length} line${cEn.length === 1 ? '' : 's'}, Arabic has ${cAr.length}. Each item needs a translation on the matching line.`;
    const priceStr = v.price.trim(); const price = Number(priceStr);
    if (!/^\d+(\.\d{1,3})?$/.test(priceStr) || !(price > 0) || price > 1000000) er.price = 'Enter a price above 0 and up to 1,000,000, with at most 3 decimals.';
    const ord = Number(v.display_order);
    if (!/^\d+$/.test(v.display_order.trim()) || ord > 100000) er.display_order = 'Whole number from 0 to 100000.';
    if (v.is_available && occ && !occ.is_active) er.is_available = 'This occasion is disabled. Enable it first, or save this gift as disabled.';
    setErrors(er);
    if (Object.keys(er).length) { setServerErr('Please fix the highlighted fields.'); return; }
    const data: AdminProduct = { id: isNew ? id : initial.id, occasion_id: v.occasion_id, age_group: v.age_group.trim() || null, name_en: v.name_en.trim(), name_ar: v.name_ar.trim(), description_en: v.description_en.trim(), description_ar: v.description_ar.trim(), contents_en: cEn, contents_ar: cAr, price, ideal_for_en: v.ideal_for_en.trim(), ideal_for_ar: v.ideal_for_ar.trim(), delivery_en: v.delivery_en.trim(), delivery_ar: v.delivery_ar.trim(), is_available: v.is_available, display_order: ord };
    if (!isNew && initial.is_available && !v.is_available) askConfirm({ title: `Disable ${initial.name_en}?`, text: 'Saving will hide this gift from customers. You can re-enable it at any time.', confirmLabel: 'Save and disable', danger: true, onConfirm: () => save.mutate(data) });
    else save.mutate(data);
  };

  const txt = (k: keyof PState, label: string, opts: { ar?: boolean; area?: boolean; hint?: string; rows?: number } = {}) =>
    <F id={`p-${k}`} label={label} ar={opts.ar} hint={opts.hint} error={errors[k]}>{p => opts.area ? <textarea {...p} rows={opts.rows ?? 3} value={v[k] as string} onChange={e => set(k, e.target.value)} data-testid={`input-${k}`} /> : <input {...p} value={v[k] as string} onChange={e => set(k, e.target.value)} data-testid={`input-${k}`} />}</F>;

  return <Drawer title={isNew ? 'New gift' : initial.name_en} sub={isNew ? 'Create gift' : 'Edit gift'} dirty={dirty} saving={save.isPending} error={serverErr} onClose={onClose} onSubmit={submit} askConfirm={askConfirm}>
    <div className="adm-preview">{isNew ? <span className="adm-thumb lg"><Gift size={24} aria-hidden="true" /></span> : <Thumb id={initial.id} />}<p className="adm-muted small">{isNew ? 'New gifts show a branded placeholder until a photo is added by the team.' : 'Photos are managed separately and are not changed here.'}</p></div>
    <fieldset><legend>Basics</legend>
      {isNew ? txt('id', 'Gift ID', { hint: 'Permanent web address, e.g. eid-sweets-box. Cannot be changed later.' })
        : <div className="adm-field"><span className="adm-label">Gift ID</span><code className="adm-fixed" data-testid="text-product-id">{initial.id}</code><small>IDs are permanent.</small></div>}
      <div className="adm-grid2">
        <F id="p-occasion" label="Occasion" error={errors.occasion_id}>{p => <select {...p} value={v.occasion_id} onChange={e => set('occasion_id', e.target.value)} data-testid="select-occasion">{!occ && <option value="">Choose...</option>}{occasions.map(o => <option key={o.id} value={o.id}>{o.name_en}{o.is_active ? '' : ' (disabled)'}</option>)}</select>}</F>
        {txt('age_group', 'Age group (optional)', { hint: 'Leave empty if not relevant.' })}
      </div>
      <div className="adm-grid2">
        <F id="p-price" label="Price (KWD)" error={errors.price}>{p => <input {...p} inputMode="decimal" value={v.price} onChange={e => set('price', e.target.value)} placeholder="18.500" data-testid="input-price" />}</F>
        <F id="p-order" label="Display order" error={errors.display_order} hint="Lower numbers appear first.">{p => <input {...p} inputMode="numeric" value={v.display_order} onChange={e => set('display_order', e.target.value)} data-testid="input-display_order" />}</F>
      </div>
      <label className={`adm-switch ${errors.is_available ? 'has-err' : ''}`}><input type="checkbox" checked={v.is_available} onChange={e => set('is_available', e.target.checked)} data-testid="switch-is_available" /><span className="adm-track" aria-hidden="true" /><span>Available on the storefront</span></label>
      {errors.is_available && <small className="err adm-block" role="alert">{errors.is_available}</small>}
    </fieldset>
    <fieldset><legend>Name and description</legend>
      <div className="adm-grid2">{txt('name_en', 'Name')}{txt('name_ar', 'Name', { ar: true })}</div>
      <div className="adm-grid2">{txt('description_en', 'Description', { area: true })}{txt('description_ar', 'Description', { ar: true, area: true })}</div>
    </fieldset>
    <fieldset><legend>What is inside</legend>
      <div className="adm-grid2">{txt('contents_en', 'Contents', { area: true, rows: 5, hint: `One item per line. ${lines(v.contents_en).length} items.` })}{txt('contents_ar', 'Contents', { ar: true, area: true, rows: 5, hint: `One item per line, same order. ${lines(v.contents_ar).length} items.` })}</div>
    </fieldset>
    <fieldset><legend>Ideal for and delivery</legend>
      <div className="adm-grid2">{txt('ideal_for_en', 'Ideal for', { area: true, rows: 2 })}{txt('ideal_for_ar', 'Ideal for', { ar: true, area: true, rows: 2 })}</div>
      <div className="adm-grid2">{txt('delivery_en', 'Delivery note', { area: true, rows: 2 })}{txt('delivery_ar', 'Delivery note', { ar: true, area: true, rows: 2 })}</div>
    </fieldset>
  </Drawer>;
}

type OState = { id: string; name_en: string; name_ar: string; icon: AdminOccasion['icon']; is_active: boolean; display_order: string };
function OccasionForm({ initial, existingIds, productCount, onClose, onSaved, onAuthError, askConfirm }: { initial: AdminOccasion | null; existingIds: string[]; productCount: number; onClose: () => void; onSaved: (o: AdminOccasion) => Promise<void>; onAuthError: (e: unknown) => boolean; askConfirm: (c: Confirm) => void }) {
  const isNew = !initial;
  const start = useMemo<OState>(() => initial ? { ...initial, display_order: String(initial.display_order) } : { id: '', name_en: '', name_ar: '', icon: 'gift', is_active: true, display_order: '0' }, [initial]);
  const [v, setV] = useState<OState>(start);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const set = <K extends keyof OState>(k: K, val: OState[K]) => { setV(o => ({ ...o, [k]: val })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };
  const save = useMutation({
    mutationFn: (data: AdminOccasion) => isNew ? createAdminOccasion(data, ADMIN_HEADERS) : updateAdminOccasion(initial.id, data, ADMIN_HEADERS),
    onSuccess: saved => onSaved(saved),
    onError: e => { if (!onAuthError(e)) setServerErr(errMessage(e, 'The occasion could not be saved.')); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault(); setServerErr(null);
    const er: Errors = {}; const id = v.id.trim();
    if (isNew) { if (!SLUG.test(id)) er.id = 'Use lowercase letters, numbers and single hyphens, e.g. new-home.'; else if (existingIds.includes(id)) er.id = 'Another occasion already uses this ID.'; }
    if (!v.name_en.trim()) er.name_en = 'Required.';
    if (!v.name_ar.trim()) er.name_ar = 'Required.';
    const ord = Number(v.display_order);
    if (!/^\d+$/.test(v.display_order.trim()) || ord > 100000) er.display_order = 'Whole number from 0 to 100000.';
    setErrors(er);
    if (Object.keys(er).length) { setServerErr('Please fix the highlighted fields.'); return; }
    const data: AdminOccasion = { id: isNew ? id : initial.id, name_en: v.name_en.trim(), name_ar: v.name_ar.trim(), icon: v.icon, is_active: v.is_active, display_order: ord };
    if (!isNew && initial.is_active && !v.is_active) askConfirm({ title: `Disable ${initial.name_en}?`, text: `Saving will hide this occasion${productCount ? ` and its ${productCount} available gift${productCount === 1 ? '' : 's'}` : ''} from the storefront. Re-enable it any time to bring them back.`, confirmLabel: 'Save and disable', danger: true, onConfirm: () => save.mutate(data) });
    else save.mutate(data);
  };
  return <Drawer title={isNew ? 'New occasion' : initial.name_en} sub={isNew ? 'Create occasion' : 'Edit occasion'} dirty={dirty} saving={save.isPending} error={serverErr} onClose={onClose} onSubmit={submit} askConfirm={askConfirm}>
    <fieldset><legend>Basics</legend>
      {isNew ? <F id="o-id" label="Occasion ID" hint="Permanent, e.g. new-home. Cannot be changed later." error={errors.id}>{p => <input {...p} value={v.id} onChange={e => set('id', e.target.value)} data-testid="input-occasion-id" />}</F>
        : <div className="adm-field"><span className="adm-label">Occasion ID</span><code className="adm-fixed" data-testid="text-occasion-id">{initial.id}</code><small>IDs are permanent.</small></div>}
      <div className="adm-grid2">
        <F id="o-name_en" label="Name" error={errors.name_en}>{p => <input {...p} value={v.name_en} onChange={e => set('name_en', e.target.value)} data-testid="input-occasion-name_en" />}</F>
        <F id="o-name_ar" label="Name" ar error={errors.name_ar}>{p => <input {...p} value={v.name_ar} onChange={e => set('name_ar', e.target.value)} data-testid="input-occasion-name_ar" />}</F>
      </div>
      <div className="adm-field"><span className="adm-label" id="o-icon-label">Icon</span>
        <div className="adm-icons" role="radiogroup" aria-labelledby="o-icon-label">{Object.values(AdminOccasionIcon).map(ic => <label key={ic} className={v.icon === ic ? 'on' : ''}><input type="radio" name="o-icon" value={ic} checked={v.icon === ic} onChange={() => set('icon', ic)} data-testid={`radio-icon-${ic}`} />{iconOf(ic, 18)}<span>{ic}</span></label>)}</div></div>
      <F id="o-order" label="Display order" hint="Lower numbers appear first." error={errors.display_order}>{p => <input {...p} inputMode="numeric" value={v.display_order} onChange={e => set('display_order', e.target.value)} data-testid="input-occasion-display_order" />}</F>
      <label className="adm-switch"><input type="checkbox" checked={v.is_active} onChange={e => set('is_active', e.target.checked)} data-testid="switch-is_active" /><span className="adm-track" aria-hidden="true" /><span>Active on the storefront</span></label>
      {!v.is_active && !isNew && initial.is_active && <div className="adm-alert warn">Disabling hides this occasion{productCount ? ` and its ${productCount} available gift${productCount === 1 ? '' : 's'}` : ''} from customers. You will be asked to confirm.</div>}
    </fieldset>
  </Drawer>;
}
