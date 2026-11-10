import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import AdminPage from '@/pages/admin';
import { Route, Switch, useLocation, useRoute, Router as WouterRouter, Link } from 'wouter';
import { ArrowRight, ArrowUpRight, Award, Check, ChevronLeft, ChevronRight, Gift, Heart, Menu, MessageCircle, Minus, Moon, Plus, Sparkles, Sun, X } from 'lucide-react';
import { testimonials, faqs } from './data/catalog.json';
import type { CatalogProduct as Product } from '@workspace/api-client-react';
import { CatalogProvider, useCatalog } from './data/catalog-provider';
import { useCart, type CartItem } from './hooks/use-cart';

const catalog = { testimonials, faqs };
// Saved prices are review history only. All totals still use the live catalog.
const hasSavedPrice = (price: unknown): price is number => typeof price === 'number' && Number.isFinite(price) && price >= 0;
const samePrice = (saved: unknown, current: number) => hasSavedPrice(saved) && Math.round(saved * 1000) === Math.round(current * 1000);
type ToastAction = { href: string; label: string };
type ToastMessage = { text: string; action?: ToastAction };
type StoreValue = { lang: 'en' | 'ar'; setLang: (lang: 'en' | 'ar') => void; cart: CartItem[]; addItem: (productId: string, price: number, message?: string, date?: string) => void; acknowledgePrices: (products: Product[]) => void; updateQty: (id: string, delta: number) => void; removeItem: (id: string) => void; toast: (message: string, action?: ToastAction) => void };
const Store = createContext<StoreValue | null>(null);
const useStore = () => {
  const value = useContext(Store);
  if (!value) throw new Error('Tawwa store is unavailable');
  return value;
};
type OccasionAnalyticsEvent = 'occasion_selected' | 'matching_products_viewed';
type AnalyticsData = Record<string, string | number | boolean>;
declare global {
  interface Window {
    umami?: { track(name: string, data?: AnalyticsData): void };
  }
}
function trackOccasionEvent(name: OccasionAnalyticsEvent, occasionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.umami?.track(name, { occasion_id: occasionId });
  } catch {
    // Analytics must never interrupt shopping.
  }
}
const fmt = (amount: number) => `${amount.toFixed(3)} KWD`;
const t = (lang: 'en' | 'ar', en: string, ar: string) => lang === 'ar' ? ar : en;
const paymentApiUrl = (path: string) => `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}api/${path}`;
const formatDeliveryDate = (value: string | undefined, lang: 'en' | 'ar') => {
  if (!value) return t(lang, 'Not selected', 'لم يتم الاختيار');
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW' : 'en-KW', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
const productImageNames: Record<string, string> = { 'birthday-bright': 'birthday-brights' };
const productImage = (id: string) => `${import.meta.env.BASE_URL}images/products/${productImageNames[id] ?? id}.jpg`;

function GiftMark({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return <svg className={className} viewBox="0 0 120 96" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'Tawwa gift box mark'} aria-hidden={decorative || undefined} xmlns="http://www.w3.org/2000/svg"><g className="speed-lines" fill="none" stroke="#C25A30" strokeWidth="5" strokeLinecap="round"><path d="M6 50h20M2 64h24M10 78h16"/></g><g transform="rotate(-5 72 62)"><rect x="40" y="46" width="64" height="44" rx="8" fill="#1F6F6B"/><rect x="35" y="34" width="74" height="16" rx="6" fill="#D9B991"/><rect x="65" y="34" width="14" height="56" fill="#C25A30"/><path d="M72 34C60 14 42 22 52 32C57 36 66 35 72 34Z" fill="#C25A30"/><path d="M72 34C84 14 102 22 92 32C87 36 78 35 72 34Z" fill="#C25A30"/><rect x="66" y="29" width="12" height="9" rx="4" fill="#C25A30"/></g></svg>;
}
function Wordmark() {
  return <span className="brand-name"><span>Tawwa</span><span>توّا</span></span>;
}
function MiniGift() { return <div className="mini-gift" aria-hidden="true"><span className="mini-ribbon" /></div>; }
function GiftDetails({ message, date, productId }: { message?: string; date?: string; productId: string }) {
  const { lang } = useStore();
  return <dl className="gift-details">
    <div>
      <dt>{t(lang, 'Delivery date', 'تاريخ التوصيل')}</dt>
      <dd data-testid={`text-delivery-date-${productId}`}>{formatDeliveryDate(date, lang)}</dd>
    </div>
    <div>
      <dt>{t(lang, 'Card message', 'رسالة البطاقة')}</dt>
      <dd data-testid={`text-card-message-${productId}`}>{message ? <q dir="auto">{message}</q> : t(lang, 'No message added', 'لم تُضف رسالة')}</dd>
    </div>
  </dl>;
}
function ProductArt({ product, className = '' }: { product?: Product; className?: string }) {
  const { lang } = useStore();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const alt = product
    ? t(lang, `${product.name} gift box with ${product.contents.slice(0, 2).join(' and ')}`, `${product.ar} مع ${product.contentsAr.slice(0, 2).join(' و')}`)
    : t(lang, 'Illustrated Tawwa gift box', 'صندوق هدايا توّا');
  return <div className={`product-card-image ${className}`}>
    {product && failedSrc !== product.id ? <img src={productImage(product.id)} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(product.id)} /> : <MiniGift />}
  </div>;
}
function ProductCard({ product }: { product: Product }) {
  const { lang } = useStore();
  const catalog = useCatalog();
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <Link href={`/product/${product.id}`} aria-label={`${t(lang, product.name, product.ar)} details`}><ProductArt product={product} /></Link>
    <div className="product-info">
      <div className="eyebrow">{t(lang, catalog.occasions.find(o => o.id === product.occasion)?.name || '', catalog.occasions.find(o => o.id === product.occasion)?.ar || '')}</div>
      <h3><Link href={`/product/${product.id}`}>{t(lang, product.name, product.ar)}</Link></h3>
      <p className="muted">{t(lang, product.description, product.descriptionAr)}</p>
      <div className="product-meta"><span className="price">{fmt(product.price)}</span><Link className="icon-button" href={`/product/${product.id}`} aria-label="View gift details"><ArrowUpRight size={19} /></Link></div>
    </div>
  </article>;
}
function Carousel({ items }: { items: Product[] }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const getStepSize = () => {
    const el = ref.current;
    const slide = el?.querySelector<HTMLElement>('.carousel-slide');
    return (slide?.offsetWidth || 300) + 20;
  };
  const scrollBySlide = (direction: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * getStepSize() * (lang === 'ar' ? -1 : 1), behavior: 'smooth' });
  };
  const goToSlide = (index: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: getStepSize() * index * (lang === 'ar' ? -1 : 1), behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>('.carousel-slide');
    if (slide) {
      const index = Math.round(Math.abs(el.scrollLeft) / (slide.offsetWidth + 20));
      setActive(Math.max(0, Math.min(index, items.length - 1)));
    }
  };
  return <div className="carousel-wrap" role="region" aria-roledescription="carousel" aria-label={t(lang, 'Featured gift boxes', 'صناديق الهدايا المميزة')}>
    <div className="carousel" ref={ref} onScroll={onScroll} tabIndex={0} aria-label={t(lang, 'Gift slides', 'شرائح الهدايا')} onKeyDown={e => { if (e.key === 'ArrowRight') scrollBySlide(lang === 'ar' ? -1 : 1); if (e.key === 'ArrowLeft') scrollBySlide(lang === 'ar' ? 1 : -1); }}>
      {items.map((item, index) => <div className="carousel-slide" key={item.id} role="group" aria-roledescription="slide" aria-label={t(lang, `${index + 1} of ${items.length}: ${item.name}`, `${index + 1} من ${items.length}: ${item.ar}`)}><ProductCard product={item} /></div>)}
    </div>
    <div className="section-head" style={{ margin: '8px 0 0', alignItems: 'center' }}>
      <div className="carousel-controls" role="group" aria-label={t(lang, 'Carousel controls', 'أزرار التنقل')}><button className="carousel-control" onClick={() => scrollBySlide(-1)} disabled={active === 0} aria-label={t(lang, 'Previous slide', 'الشريحة السابقة')}><ChevronLeft /></button><button className="carousel-control" onClick={() => scrollBySlide(1)} disabled={active >= items.length - 1} aria-label={t(lang, 'Next slide', 'الشريحة التالية')}><ChevronRight /></button></div>
      <div className="dots" role="group" aria-label={t(lang, 'Choose a slide', 'اختر شريحة')}>{items.map((item, i) => <button key={item.id} className={`dot ${i === active ? 'active' : ''}`} aria-label={t(lang, `Go to slide ${i + 1}: ${item.name}`, `انتقل إلى الشريحة ${i + 1}: ${item.ar}`)} aria-current={i === active ? 'true' : undefined} onClick={() => goToSlide(i)} />)}</div>
    </div>
  </div>;
}
function Header() {
  const { lang, setLang, cart } = useStore();
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => setOpen(false), [location]);
  const nav = <>
    <Link href="/occasions">{t(lang, 'Occasions', 'المناسبات')}</Link>
    <Link href="/gift-finder">{t(lang, 'Gift Finder', 'مساعد الهدايا')}</Link>
    <a href="/#how-it-works">{t(lang, 'How it works', 'كيف نعمل')}</a>
  </>;
  return <header className="topbar">
    <div className="container nav">
      <Link href="/" className="brand" aria-label="Tawwa home"><GiftMark className="brand-mark" /><Wordmark /></Link>
      <nav className="nav-links" aria-label="Main navigation">{nav}</nav>
      <div className="nav-actions">
        <button className="lang-button" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} aria-label={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}>{lang === 'en' ? 'العربية' : 'English'}</button>
        <Link className="icon-button" href="/cart" aria-label={`Cart, ${cart.reduce((sum, item) => sum + item.quantity, 0)} items`}><Gift size={19} />{cart.length > 0 && <span className="cart-count">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>}</Link>
        <button className="icon-button mobile-menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X /> : <Menu />}</button>
      </div>
    </div>
    {open && <nav className="mobile-nav" aria-label="Mobile navigation">{nav}<button className="lang-button" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{lang === 'en' ? 'العربية' : 'English'}</button></nav>}
  </header>;
}
function Footer() {
  const { lang } = useStore();
  const replay = () => { localStorage.removeItem('tawwa-intro-seen'); window.location.reload(); };
  return <footer className="footer">
    <div className="container">
      <div className="footer-grid">
        <div><Link href="/" className="brand"><GiftMark className="brand-mark" /><Wordmark /></Link><p style={{ maxWidth: 300, marginTop: 20 }}>{t(lang, "Tawwa. Gift’s on its way.", 'توّا وتوصلك الهدية.')}</p><button className="button outline small" style={{ color: 'var(--cream)', borderColor: 'var(--cream)' }} onClick={replay}>{t(lang, 'Replay intro', 'إعادة المقدمة')}</button></div>
        <div><h3>{t(lang, 'EXPLORE', 'اكتشف')}</h3><div className="footer-links"><Link href="/occasions">{t(lang, 'Shop occasions', 'تسوق حسب المناسبة')}</Link><Link href="/gift-finder">{t(lang, 'Gift Finder', 'مساعد الهدايا')}</Link><a href="/#how-it-works">{t(lang, 'How it works', 'كيف نعمل')}</a></div></div>
        <div><h3>{t(lang, 'HERE TO HELP', 'نحن هنا للمساعدة')}</h3><div className="footer-links"><Link href="/faq">{t(lang, 'Delivery & FAQ', 'التوصيل والأسئلة')}</Link><Link href="/contact">{t(lang, 'Contact us', 'تواصل معنا')}</Link><a href="https://wa.me/?text=Hello%20Tawwa" target="_blank" rel="noreferrer">WhatsApp</a><Link href="/admin" data-testid="link-staff-access">{t(lang, 'Staff access', 'دخول الموظفين')}</Link></div></div>
        <div><h3>{t(lang, 'DELIVERING ACROSS', 'نوصل إلى')}</h3><div className="footer-links"><span>{t(lang, 'All six Kuwait governorates', 'محافظات الكويت الست')}</span><span>{t(lang, 'Order by 3 PM for tonight', 'اطلب قبل ٣ مساءً للتوصيل الليلة')}</span></div></div>
      </div>
      <div className="footer-bottom"><span>© 2025 Tawwa. Made for the moments that matter.</span><span>{t(lang, 'Demo shop · No payment is collected', 'متجر تجريبي · لا يتم تحصيل أي مدفوعات')}</span></div>
    </div>
  </footer>;
}
function Intro() {
  const [visible, setVisible] = useState(() => !localStorage.getItem('tawwa-intro-seen') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dismiss = () => { localStorage.setItem('tawwa-intro-seen', 'yes'); setVisible(false); };
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(dismiss, 4500);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  return <div className="intro-overlay" aria-label="Tawwa gift arriving"><button className="intro-skip" onClick={dismiss}>Skip intro</button><GiftMark className="gift-mark" /><div className="intro-title">Tawwa. Gift’s on its way.</div></div>;
}
function Home() {
  const { products, availableOccasions } = useCatalog();
  const { lang } = useStore();
  const [testimonial, setTestimonial] = useState(0);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [activeOccasionIndex, setActiveOccasionIndex] = useState(0);
  const [questionRevealed, setQuestionRevealed] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [ctaInView, setCtaInView] = useState(false);
  const [ctaRevealed, setCtaRevealed] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);
  const productsRef = useRef<HTMLElement | null>(null);
  const occasionRailRef = useRef<HTMLDivElement | null>(null);
  const occasions = availableOccasions;
  const iconFor = (icon: string) => icon === 'heart' ? <Heart /> : icon === 'sun' ? <Sun /> : icon === 'award' ? <Award /> : icon === 'moon' ? <Moon /> : icon === 'sparkles' ? <Sparkles /> : <Gift />;
  const visibleProducts = selectedOccasion ? products.filter(product => product.occasion === selectedOccasion) : products.slice(0, 7);
  const selectedName = occasions.find(occasion => occasion.id === selectedOccasion);
  const chooseOccasion = (id: string) => {
    trackOccasionEvent('occasion_selected', id);
    setSelectedOccasion(id);
    window.setTimeout(() => productsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    }), 40);
  };
  useEffect(() => {
    if (!selectedOccasion || !availableOccasions.some(occasion => occasion.id === selectedOccasion)) return;
    const section = productsRef.current;
    if (!section) return;
    let tracked = false;
    const observer = new IntersectionObserver(entries => {
      if (tracked || !entries.some(entry => entry.isIntersecting)) return;
      tracked = true;
      trackOccasionEvent('matching_products_viewed', selectedOccasion);
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [selectedOccasion]);
  const scrollToOccasion = (index: number) => {
    const rail = occasionRailRef.current;
    if (!rail || occasions.length === 0) return;
    const next = Math.max(0, Math.min(index, occasions.length - 1));
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setActiveOccasionIndex(next);
    rail.scrollTo({
      left: maxScroll * (next / Math.max(1, occasions.length - 1)) * (lang === 'ar' ? -1 : 1),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };
  const updateOccasionIndex = () => {
    const rail = occasionRailRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    if (maxScroll <= 0) return;
    const progress = Math.abs(rail.scrollLeft) / maxScroll;
    const index = Math.round(progress * (occasions.length - 1));
    setActiveOccasionIndex(Math.max(0, Math.min(index, occasions.length - 1)));
  };
  useEffect(() => {
    const hero = heroRef.current;
    const cta = ctaRef.current;
    if (!hero || !cta) return;
    const updateGift = () => {
      const heroTop = hero.getBoundingClientRect().top + window.scrollY;
      setQuestionRevealed(window.scrollY > heroTop + 100);
    };
    updateGift();
    window.addEventListener('scroll', updateGift, { passive: true });
    if (!('IntersectionObserver' in window)) {
      setCtaRevealed(true);
      return () => window.removeEventListener('scroll', updateGift);
    }
    const heroObserver = new IntersectionObserver(([entry]) => {
      setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, { threshold: 0 });
    const ctaObserver = new IntersectionObserver(([entry]) => {
      setCtaInView(entry.isIntersecting);
      if (entry.isIntersecting) setCtaRevealed(true);
    }, { threshold: 0.15 });
    heroObserver.observe(hero);
    ctaObserver.observe(cta);
    return () => {
      heroObserver.disconnect();
      ctaObserver.disconnect();
      window.removeEventListener('scroll', updateGift);
    };
  }, []);
  const moveOccasionFocus = (index: number) => {
    const buttons = occasionRailRef.current?.querySelectorAll<HTMLButtonElement>('.occasion-tile');
    if (!buttons?.length) return;
    const next = (index + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };
  return <>
    <div className="announcement">{lang === 'ar' ? <>اطلب قبل <strong>٣ مساءً</strong> لتوصيل الليلة. تأخرت؟ نحن معك.</> : <>Order by <strong>3 PM</strong>, delivered tonight. Last-minute? We’ve got you.</>}</div>
    <main>
      <section className={`hero ${questionRevealed ? 'hero-gift-open' : ''}`} ref={heroRef}>
        <div className="container hero-grid">
          <div className="hero-side hero-side-start">
            <div className="eyebrow">{t(lang, 'KUWAIT, RIGHT ON TIME', 'الكويت، في وقتها')}</div>
            <h1>{lang === 'ar' ? <>هدية جميلة.<br /><em>في وقتها تماماً.</em></> : <>A good gift.<br /><em>Right on time.</em></>}</h1>
            <Link className="button" href="/gift-finder">{t(lang, 'Find a gift', 'اعثر على هدية')} <ArrowRight size={18} /></Link>
          </div>
          <div className="hero-visual">
            <div className="hero-note">{t(lang, 'Just in time.', 'في وقتها تماماً.')}</div>
            <div className="gift-art" aria-hidden="true"><div className="orbit" /><div className="box"><span className="lid" /><span className="ribbon" /><span className="bow" /></div></div>
            {questionRevealed && <p className="hero-question-reveal" role="status" aria-live="polite">{t(lang, 'What are you celebrating?', 'ما المناسبة التي تحتفل بها؟')}</p>}
            <span className="hero-spark one" aria-hidden="true">✳</span><span className="hero-spark two" aria-hidden="true">✳</span>
          </div>
          <div className="hero-side hero-side-end">
            <p className="hero-aside">{t(lang, 'Thoughtful boxes, delivered across Kuwait today.', 'صناديق هدايا مختارة بعناية، تصلك اليوم في الكويت.')}</p>
            <div className="hero-delivery"><span className="hero-delivery-mark"><Check size={17} /></span>{t(lang, 'Order by 3 PM for tonight', 'اطلب قبل ٣ مساءً لتوصيل الليلة')}</div>
          </div>
        </div>
      </section>
      <section className="section discovery-section">
        <div className="container">
          <div className="discovery-head">
            <div className="discovery-title-wrap">
              <div className="eyebrow">{t(lang, 'A MOMENT, MADE EASY', 'لحظتك، بكل سهولة')}</div>
              <h2 className="discovery-question" id="occasion-question">{t(lang, 'Choose an occasion', 'اختر مناسبة')}</h2>
            </div>
          </div>
          <div className="occasion-discovery-row">
            <div className="occasion-carousel" role="region" aria-roledescription="carousel" aria-labelledby="occasion-question">
              <div className="occasion-rail" ref={occasionRailRef} tabIndex={0} onScroll={updateOccasionIndex} onKeyDown={event => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const buttons = Array.from(occasionRailRef.current?.querySelectorAll<HTMLButtonElement>('.occasion-tile') || []);
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const forward = (event.key === 'ArrowRight') !== (lang === 'ar');
              const next = current < 0 ? (forward ? 0 : buttons.length - 1) : current + (forward ? 1 : -1);
              moveOccasionFocus(next);
            }}>
              {occasions.map((occasion, index) => <div className="occasion-slide" key={occasion.id} role="group" aria-roledescription="slide" aria-label={t(lang, `${index + 1} of ${occasions.length}: ${occasion.name}`, `${index + 1} من ${occasions.length}: ${occasion.ar}`)} data-testid={`slide-occasion-${occasion.id}`}>
                <button type="button" className={`occasion-tile ${selectedOccasion === occasion.id ? 'is-selected' : ''}`} aria-pressed={selectedOccasion === occasion.id} aria-controls="occasion-products" data-testid={`button-occasion-${occasion.id}`} onClick={() => chooseOccasion(occasion.id)}>
                  <span className="occasion-icon">{iconFor(occasion.icon)}</span><span className="occasion-label">{t(lang, occasion.name, occasion.ar)}</span><span className="occasion-pick">{t(lang, 'See gifts', 'شاهد الهدايا')} <ArrowUpRight size={15} /></span>
                </button>
              </div>)}
              </div>
              <div className="occasion-carousel-controls">
                <div className="carousel-controls" role="group" aria-label={t(lang, 'Occasion carousel controls', 'أزرار مناسبات الهدايا')}>
                  <button className="carousel-control" onClick={() => scrollToOccasion(activeOccasionIndex - 1)} disabled={activeOccasionIndex === 0} aria-label={t(lang, 'Previous occasion', 'المناسبة السابقة')} data-testid="button-occasion-previous"><ChevronLeft /></button>
                  <button className="carousel-control" onClick={() => scrollToOccasion(activeOccasionIndex + 1)} disabled={activeOccasionIndex >= occasions.length - 1} aria-label={t(lang, 'Next occasion', 'المناسبة التالية')} data-testid="button-occasion-next"><ChevronRight /></button>
                </div>
                <div className="dots" role="group" aria-label={t(lang, 'Choose an occasion slide', 'اختر شريحة المناسبة')}>
                  {occasions.map((occasion, index) => <button key={occasion.id} className={`dot ${activeOccasionIndex === index ? 'active' : ''}`} aria-label={t(lang, `Go to ${occasion.name} slide`, `انتقل إلى شريحة ${occasion.ar}`)} aria-current={activeOccasionIndex === index ? 'true' : undefined} onClick={() => scrollToOccasion(index)} />)}
                </div>
              </div>
            </div>
            <Link href="/occasions" className="button outline small occasion-all">{t(lang, 'All occasions', 'كل المناسبات')} <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </section>
      <section className="section home-products-section" ref={productsRef} id="occasion-products" aria-labelledby="home-products-title">
        <div className="container">
          <div className="section-head">
            <div><div className="eyebrow">{t(lang, selectedName ? 'READY FOR THIS MOMENT' : 'READY WHEN YOU ARE', selectedName ? 'جاهزة لهذه المناسبة' : 'جاهزة وقتما تحتاج')}</div>
              <h2 id="home-products-title">{selectedName ? t(lang, selectedName.name, selectedName.ar) : t(lang, 'A few good places to start.', 'بعض الأفكار الجميلة للبداية.')}</h2>
              <p className="muted" aria-live="polite">{selectedName ? t(lang, `Gifts for ${selectedName.name.toLowerCase()}.`, `هدايا لمناسبة ${selectedName.ar}.`) : t(lang, 'A small edit from the gift shelf.', 'مختارات صغيرة من رف الهدايا.')}</p>
            </div>
            <Link href="/occasions" className="button outline small">{t(lang, 'Shop all', 'تسوق الكل')} <ArrowUpRight size={16} /></Link>
          </div>
          <Carousel key={selectedOccasion || 'featured'} items={visibleProducts} />
        </div>
      </section>
      <section className="container"><div className="fast-strip"><div><div className="eyebrow">{t(lang, 'A LITTLE URGENCY, A LOT OF RELIEF', 'استعجال بسيط وراحة كبيرة')}</div><h2>{t(lang, 'Need it fast? We move fast.', 'تحتاجها بسرعة؟ نحن جاهزون.')}</h2><p style={{ margin: 0 }}>{t(lang, 'Order by 3 PM and we’ll deliver tonight. No frantic mall laps required.', 'اطلب قبل ٣ مساءً ونوصلها الليلة. لا حاجة لجولة متوترة في السوق.')}</p></div><Link className="button" href="/occasions">{t(lang, 'Shop ready-to-go', 'تسوق الهدايا الجاهزة')} <ArrowRight size={18} /></Link></div></section>
      <section className="section" id="how-it-works" style={{ background: '#f0e9de' }}><div className="container"><div className="eyebrow">{t(lang, 'THREE EASY STEPS', 'ثلاث خطوات سهلة')}</div><h2>{t(lang, 'You bring the moment. We’ll bring the box.', 'أنت تختار المناسبة، ونحن نحضر الهدية.')}</h2><div className="steps" style={{ marginTop: 48 }}><div className="step"><div className="step-number">01 / PICK</div><h3>{t(lang, 'Pick the moment', 'اختر المناسبة')}</h3><p className="muted">{t(lang, 'Birthdays, new arrivals, fresh starts—or just because. Start with who you’re celebrating.', 'أعياد ميلاد، مواليد جدد، بدايات جديدة، أو بلا مناسبة. ابدأ بمن تحتفل به.')}</p></div><div className="step"><div className="step-number">02 / PERSONALISE</div><h3>{t(lang, 'Add your words', 'أضف كلماتك')}</h3><p className="muted">{t(lang, 'Write a note that sounds like you. We’ll tuck it into the box.', 'اكتب رسالة تعبّر عنك، وسنضعها داخل الصندوق.')}</p></div><div className="step"><div className="step-number">03 / WE DELIVER</div><h3>{t(lang, 'We’ll get it there', 'نوصلها بالنيابة عنك')}</h3><p className="muted">{t(lang, 'Choose a delivery date. We’ll take it from here—with updates along the way.', 'اختر موعد التوصيل، واترك الباقي علينا مع تحديثات مستمرة.')}</p></div></div></div></section>
      <section className="testimonials"><div className="container"><div className="eyebrow" style={{ textAlign: 'center' }}>{t(lang, 'KIND WORDS, RIGHT ON TIME', 'كلمات جميلة في وقتها')}</div><h2 style={{ textAlign: 'center', marginBottom: 36 }}>{t(lang, 'They had a moment. We had the box.', 'كان لديهم مناسبة، وكانت الهدية جاهزة.')}</h2><div className="quote">“{t(lang, catalog.testimonials[testimonial].quote, catalog.testimonials[testimonial].ar)}”<div className="quote-by">{catalog.testimonials[testimonial].name} · {catalog.testimonials[testimonial].place}</div></div><div className="dots" style={{ marginTop: 30 }}>{catalog.testimonials.map((item, i) => <button key={item.name} className={`dot ${testimonial === i ? 'active' : ''}`} aria-label={`Testimonial ${i + 1}`} aria-pressed={testimonial === i} onClick={() => setTestimonial(i)} />)}</div></div></section>
      <section className="section"><div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}><div><div className="eyebrow">{t(lang, 'A PROMISE, NOT A POSTER', 'وعدنا لك')}</div><h2>{t(lang, 'Your gift should feel just right.', 'نريد أن تكون هديتك كما تمنيتها.')}</h2><p className="muted">{t(lang, 'If something arrives damaged or not as expected, talk to us. We’ll make it right.', 'إذا وصل شيء تالفاً أو مختلفاً، تواصل معنا وسنعالج الأمر.')}</p></div><Link className="button secondary" href="/faq">{t(lang, 'Our satisfaction promise', 'وعدنا برضاك')} <ArrowRight size={18} /></Link></div></section>
    </main>
    <section id="home-cta" ref={ctaRef} className={`home-cta ${ctaRevealed ? 'is-visible' : ''}`} aria-labelledby="home-cta-title">
      <div className="container home-cta-inner">
        <h2 id="home-cta-title">{t(lang, 'Order it Tawwa.', 'اطلبها توّا')}</h2>
        <p>{t(lang, "Order by 3 PM and it's at the door tonight.", 'اطلب قبل الساعة ٣ مساءً، وتصلك الهدية الليلة.')}</p>
        <div className="home-cta-actions">
          <Link className="button home-cta-primary" href="/gift-finder">
            <GiftMark className="home-cta-gift-mark" decorative />
            <span>{t(lang, 'Find the perfect box', 'اعثر على صندوق الهدية المناسب')}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a className="button home-cta-secondary" href="https://wa.me/?text=Hello%20Tawwa" target="_blank" rel="noreferrer" aria-label={t(lang, 'Chat on WhatsApp (opens in a new tab)', 'تواصل عبر واتساب (يفتح في نافذة جديدة)')}>
            <MessageCircle size={19} aria-hidden="true" />
            <span>{t(lang, 'Chat on WhatsApp', 'تواصل عبر واتساب')}</span>
          </a>
        </div>
      </div>
    </section>
    {pastHero && !ctaInView && <div className="mobile-home-cta">
      <Link className="button home-cta-primary" href="/gift-finder">
        <GiftMark className="home-cta-gift-mark" decorative />
        <span>{t(lang, 'Find the perfect box', 'اعثر على صندوق الهدية المناسب')}</span>
      </Link>
    </div>}
  </>;
}
function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <section className="page-intro"><div className="container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p style={{ maxWidth: 680, margin: 0 }}>{description}</p>}</div></section>;
}
function Shop() {
  const { lang } = useStore();
  const { products, availableOccasions } = useCatalog();
  const params = new URLSearchParams(window.location.search);
  const [occasion, setOccasion] = useState(() => {
    const requestedOccasion = params.get('occasion');
    return availableOccasions.some(item => item.id === requestedOccasion) ? requestedOccasion! : 'all';
  });
  const [age, setAge] = useState('all');
  const [budget, setBudget] = useState('all');
  const [speed, setSpeed] = useState('all');
  const filtered = useMemo(() => products.filter(p => (occasion === 'all' || p.occasion === occasion) && (age === 'all' || p.age === age) && (budget === 'all' || (budget === 'under25' ? p.price < 25 : budget === '25to35' ? p.price >= 25 && p.price <= 35 : p.price > 35)) && (speed === 'all' || (speed === 'tonight' ? p.delivery.toLowerCase().includes('tonight') : p.delivery.toLowerCase().includes('same-day')))), [products, occasion, age, budget, speed]);
  const occasionName = availableOccasions.find(o => o.id === occasion);
  return <><PageIntro eyebrow={t(lang, 'OCCASION FIRST', 'المناسبة أولاً')} title={t(lang, occasionName?.name || 'Find the right kind of lovely.', occasionName?.ar || 'اعثر على الهدية المناسبة.')} description={t(lang, 'Ready-made gifts for the people and moments that matter. Filter it down, then leave the wrapping to us.', 'هدايا جاهزة للأشخاص والمناسبات المهمة. اختر ما يناسبك واترك التغليف علينا.')} />
    <main className="section"><div className="container shop-layout"><aside className="filters" aria-label="Product filters">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3>{t(lang, 'Make it a match', 'اختر ما يناسبك')}</h3><button className="remove" onClick={() => { setOccasion('all'); setAge('all'); setBudget('all'); setSpeed('all'); }}>{t(lang, 'Reset', 'إعادة')}</button></div>
      <div className="filter-group"><h3>{t(lang, 'Occasion', 'المناسبة')}</h3>{availableOccasions.map(o => <label key={o.id}><input type="radio" name="occasion" checked={occasion === o.id} onChange={() => setOccasion(o.id)} />{t(lang, o.name, o.ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Budget', 'الميزانية')}</h3>{[['all','Any budget','أي ميزانية'],['under25','Under 25 KWD','أقل من ٢٥ د.ك'],['25to35','25–35 KWD','٢٥–٣٥ د.ك'],['over35','Over 35 KWD','أكثر من ٣٥ د.ك']].map(([v,en,ar]) => <label key={v}><input type="radio" name="budget" checked={budget === v} onChange={() => setBudget(v)} />{t(lang,en,ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Age group', 'الفئة العمرية')}</h3>{[['all','Any age','كل الأعمار'],['3-6','Ages 3–6','الأعمار ٣–٦'],['7-12','Ages 7–12','الأعمار ٧–١٢']].map(([v,en,ar]) => <label key={v}><input type="radio" name="age" checked={age === v} onChange={() => setAge(v)} />{t(lang,en,ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Delivery speed', 'سرعة التوصيل')}</h3>{[['all','Any delivery','كل الخيارات'],['tonight','Tonight','الليلة'],['same','Same day','نفس اليوم']].map(([v,en,ar]) => <label key={v}><input type="radio" name="speed" checked={speed === v} onChange={() => setSpeed(v)} />{t(lang,en,ar)}</label>)}</div>
    </aside><div><p className="muted" aria-live="polite">{t(lang, `${filtered.length} thoughtful boxes`, `${filtered.length} هدية مختارة`)}</p>{filtered.length ? <div className="shop-products">{filtered.map(p => <ProductCard key={p.id} product={p} />)}</div> : <div className="empty-state"><Gift size={42} className="empty-state-mark" /><h2>{t(lang, 'A little too specific?', 'هل اخترت تفاصيل كثيرة؟')}</h2><p>{t(lang, 'Try loosening a filter and we’ll find your gift.', 'خفف بعض الخيارات وسنجد الهدية المناسبة.')}</p><button className="button" onClick={() => { setAge('all'); setBudget('all'); setSpeed('all'); }}>{t(lang, 'Clear filters', 'مسح الخيارات')}</button></div>}</div></div></main></>;
}
function ProductPage() {
  const catalog = useCatalog();
  const { products } = catalog;
  const { lang, addItem, toast } = useStore();
  const [, params] = useRoute('/product/:id');
  const product = products.find(p => p.id === params?.id);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  if (!product) return <NotFound />;
  const add = () => {
    addItem(product.id, product.price, message, date);
    toast(t(lang, 'Added 🎁', 'أضيفت 🎁'), {
      href: '/cart',
      label: t(lang, 'View cart', 'عرض السلة'),
    });
  };
  return <><main className="section"><div className="container product-layout">
     <div className="product-gallery"><div className="gallery-main"><img className="product-gallery-image" src={productImage(product.id)} alt={t(lang, `${product.name} gift box with ${product.contents.join(', ')}`, `${product.ar} مع ${product.contentsAr.join('، ')}`)} loading="eager" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /></div></div>
    <div className="product-detail"><div className="eyebrow">{t(lang, catalog.occasions.find(o => o.id === product.occasion)?.name || 'GIFT BOX', catalog.occasions.find(o => o.id === product.occasion)?.ar || 'هدية')}</div><h1>{t(lang, product.name, product.ar)}</h1><div className="price">{fmt(product.price)}</div><p className="muted" style={{ marginTop: 18 }}>{t(lang, product.description, product.descriptionAr)}</p><div className="detail-benefit"><Check size={18} />{t(lang, product.idealFor, product.idealForAr)}</div><div className="detail-benefit"><Check size={18} />{t(lang, product.delivery, product.deliveryAr)}</div>
      <div className="contents"><h3>{t(lang, 'Inside the box', 'محتويات الصندوق')}</h3><ul>{(lang === 'ar' ? product.contentsAr : product.contents).map(item => <li key={item}>{item}</li>)}</ul></div>
       <div className="product-options">
         <div className="field">
           <label htmlFor="gift-message">{t(lang, 'Your card message', 'رسالة البطاقة')} <span className="muted">({t(lang, 'optional', 'اختياري')})</span></label>
           <textarea id="gift-message" data-testid={`input-card-message-${product.id}`} maxLength={180} value={message} onChange={e => setMessage(e.target.value)} placeholder={t(lang, 'A few words from you…', 'اكتب كلماتك هنا...')} />
           <span className="muted">{message.length}/180</span>
         </div>
         <div className="field">
           <label htmlFor="delivery-date">{t(lang, 'Delivery date', 'تاريخ التوصيل')}</label>
           <input id="delivery-date" data-testid={`input-delivery-date-${product.id}`} type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={e => setDate(e.target.value)} />
         </div>
         <button className="button" onClick={add} data-testid={`button-add-to-cart-${product.id}`}>{t(lang, 'Add to cart', 'أضف إلى السلة')} <Gift size={18} /></button>
         <div className="detail-benefit"><Check size={18} />{t(lang, 'Pay securely with Stripe. Test mode is on—no real charges.', 'ادفع بأمان عبر Stripe. وضع الاختبار مفعّل ولن يتم خصم أي مبالغ حقيقية.')}</div>
       </div>
    </div>
   </div></main><div className="mobile-sticky-cta"><span className="price">{fmt(product.price)}</span><button className="button" onClick={add} data-testid={`button-add-to-cart-sticky-${product.id}`}>{t(lang, 'Add to cart', 'أضف إلى السلة')}</button></div></>;
}
function GiftFinder() {
  const { lang } = useStore();
  const { products, availableOccasions } = useCatalog();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ occasion: '', recipient: '', budget: '', date: '' });
  const [complete, setComplete] = useState(false);
  const questions = [
    { key: 'occasion', title: t(lang, 'What’s the occasion?', 'ما المناسبة؟'), choices: availableOccasions.map(o => ({ id: o.id, label: t(lang, o.name, o.ar) })) },
    { key: 'recipient', title: t(lang, 'Who’s getting the good stuff?', 'لمن هذه الهدية؟'), choices: [{id:'child',label:t(lang,'A kid','طفل')},{id:'newborn',label:t(lang,'New mum or newborn','أم أو مولود جديد')},{id:'retiree',label:t(lang,'Someone retiring','شخص متقاعد')},{id:'friend',label:t(lang,'A friend or family','صديق أو فرد من العائلة')}] },
    { key: 'budget', title: t(lang, 'What feels right?', 'ما الميزانية المناسبة؟'), choices: [{id:'under25',label:t(lang,'Under 25 KWD','أقل من ٢٥ د.ك')},{id:'25to35',label:t(lang,'25–35 KWD','٢٥–٣٥ د.ك')},{id:'over35',label:t(lang,'Over 35 KWD','أكثر من ٣٥ د.ك')}] }
  ];
  const answer = (key: keyof typeof answers, value: string) => setAnswers({ ...answers, [key]: value });
  const recipientOccasion = answers.recipient === 'child' ? 'kids' : answers.recipient === 'newborn' ? 'newborn' : answers.recipient === 'retiree' ? 'retirement' : '';
  const results = products.filter(p => (!answers.occasion || p.occasion === answers.occasion) && (!recipientOccasion || p.occasion === recipientOccasion) && (!answers.budget || (answers.budget === 'under25' ? p.price < 25 : answers.budget === '25to35' ? p.price >= 25 && p.price <= 35 : p.price > 35)));
  const current = questions[step];
  return <><PageIntro eyebrow={t(lang, 'A VERY SHORT QUIZ', 'اختبار سريع')} title={t(lang, 'We’ll find the one.', 'سنجد الهدية المناسبة.')} description={t(lang, 'Four little questions. No overthinking required.', 'أربع أسئلة بسيطة. لا داعي للتفكير كثيراً.')} /><main className="container">{!complete ? <div className="quiz-panel"><div className="progress-track" aria-label={`Step ${step + 1} of 4`}><span style={{ width: `${(step + 1) * 25}%` }} /></div>{step < 3 ? <><div className="eyebrow">{t(lang, `QUESTION 0${step + 1} / 04`, `السؤال ٠${step + 1} / ٠٤`)}</div><h2>{current.title}</h2><div className="choice-grid">{current.choices.map(choice => <button key={choice.id} className={`choice ${answers[current.key as keyof typeof answers] === choice.id ? 'selected' : ''}`} onClick={() => answer(current.key as keyof typeof answers, choice.id)}>{choice.label}</button>)}</div><div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><button className="button outline" disabled={step === 0} onClick={() => setStep(step - 1)}>{t(lang, 'Back', 'السابق')}</button><button className="button" disabled={!answers[current.key as keyof typeof answers]} onClick={() => setStep(step + 1)}>{t(lang, 'Next', 'التالي')} <ArrowRight size={18} /></button></div></> : <><div className="eyebrow">{t(lang, 'QUESTION 04 / 04', 'السؤال ٠٤ / ٠٤')}</div><h2>{t(lang, 'When should it arrive?', 'متى تريد وصولها؟')}</h2><div className="field"><label htmlFor="finder-date">{t(lang, 'Delivery date', 'تاريخ التوصيل')}</label><input id="finder-date" type="date" min={new Date().toISOString().slice(0,10)} value={answers.date} onChange={e => answer('date',e.target.value)} /></div><div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><button className="button outline" onClick={() => setStep(2)}>{t(lang, 'Back', 'السابق')}</button><button className="button" onClick={() => setComplete(true)}>{t(lang, 'Show my gifts', 'اعرض الهدايا')} <ArrowRight size={18} /></button></div></>}</div> : <div className="section"><div className="section-head"><div><div className="eyebrow">{t(lang, 'YOUR SHORTLIST', 'اختياراتك')}</div><h2>{t(lang, 'Good picks. You’ve got this.', 'اختيارات جميلة. أنت قادر على ذلك.')}</h2><p className="muted">{t(lang, 'A few boxes that fit the moment. Choose your favourite.', 'بعض الهدايا المناسبة للمناسبة. اختر ما يعجبك.')}</p></div><button className="button outline small" onClick={() => {setStep(0);setAnswers({ occasion: '', recipient: '', budget: '', date: '' });setComplete(false);}}>{t(lang,'Start again','ابدأ من جديد')}</button></div>{results.length ? <div className="shop-products">{results.slice(0,4).map(p => <ProductCard key={p.id} product={p} />)}</div> : <div className="empty-state"><p>{t(lang, 'We’re still curating that occasion. Browse all boxes for now.', 'نعمل على تجهيز هدايا هذه المناسبة. تصفح كل الهدايا الآن.')}</p><Link className="button" href="/occasions">{t(lang, 'Browse occasions','تصفح المناسبات')}</Link></div>}</div>}</main></>;
}
function Cart() {
  const catalog = useCatalog();
  const { products } = catalog;
  const { lang, cart, updateQty, removeItem, acknowledgePrices } = useStore();
  const [checkout, setCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [error, setError] = useState('');
  const checkoutAttempt = useRef<{ requestId: string; token: string; body: string } | null>(null);
  const checkoutReviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(paymentApiUrl('payments/config'), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Checkout is not configured.');
        const config = await response.json() as { deliveryFee: number; currency: string; testMode: boolean };
        if (!Number.isFinite(config.deliveryFee) || config.currency !== 'kwd') throw new Error('Invalid payment configuration.');
        setDeliveryFee(config.deliveryFee);
      })
      .catch(() => { if (!controller.signal.aborted) setError(t(lang, 'Secure checkout is temporarily unavailable.', 'الدفع الآمن غير متاح مؤقتاً.')); });
    return () => controller.abort();
  }, [lang]);
  useEffect(() => {
    if (!checkout) return;
    checkoutReviewRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [checkout]);
  const enriched = cart.map(item => ({ ...item, product: products.find(p => p.id === item.productId) }));
  const hasUnavailable = enriched.some(item => !item.product);
  const priceChanges = enriched.filter(item => item.product && !samePrice(item.acknowledgedPrice, item.product.price));
  const needsPriceReview = priceChanges.length > 0;
  const reviewing = checkout && !hasUnavailable;
  const subtotal = Number(enriched.reduce((sum, item) => sum + (item.product?.price ?? 0) * item.quantity, 0).toFixed(3));
  const total = Number((subtotal + (deliveryFee ?? 0)).toFixed(3));
  const checkoutSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    // Guard submission too: Enter or a programmatic submit cannot bypass review.
    if (hasUnavailable || !cart.length || needsPriceReview || deliveryFee === null || submitting) return;
    const form = e.currentTarget;
    if (!form.reportValidity()) { setError(t(lang, 'Please check the highlighted details.', 'يرجى التأكد من البيانات المطلوبة.')); return; }
    const formData = new FormData(form);
    const request = {
      items: cart.map(({ productId, quantity, message, date }) => ({
        productId,
        quantity,
        ...(message ? { message } : {}),
        ...(date ? { date } : {}),
      })),
      email: String(formData.get('email') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      governorate: String(formData.get('area') ?? ''),
      address: String(formData.get('address') ?? '').trim(),
      recipient: String(formData.get('recipient') ?? '').trim(),
    };
    const body = JSON.stringify(request);
    if (checkoutAttempt.current?.body !== body) {
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      checkoutAttempt.current = {
        requestId: crypto.randomUUID(),
        token: Array.from(tokenBytes, byte => byte.toString(16).padStart(2, '0')).join(''),
        body,
      };
    }
    setSubmitting(true);
    try {
      const response = await fetch(paymentApiUrl('payments/checkout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': checkoutAttempt.current.requestId,
          'X-Order-Access-Token': checkoutAttempt.current.token,
        },
        body,
      });
      const result = await response.json() as { checkoutUrl?: string; orderId?: string; error?: string };
      if (!response.ok || !result.checkoutUrl || !result.orderId) throw new Error(result.error || 'Secure checkout is unavailable. Your cart is saved.');
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') {
        throw new Error('Stripe returned an unexpected checkout address.');
      }
      try { sessionStorage.setItem(`tawwa-order-cart:${result.orderId}`, JSON.stringify(cart)); } catch { /* Keep the cart; payment can still proceed. */ }
      window.location.assign(destination.toString());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t(lang, 'Checkout failed. Your cart is saved.', 'تعذر إتمام الطلب. سلتك محفوظة.'));
    } finally {
      setSubmitting(false);
    }
  };
  if (!enriched.length) return <main className="container"><div className="empty-state"><GiftMark className="brand-mark empty-state-mark" /><div className="eyebrow">{t(lang, 'YOUR CART', 'سلتك')}</div><h1 style={{ fontSize: 42 }}>{t(lang, 'A lovely gift goes here.', 'هديتك الجميلة تبدأ من هنا.')}</h1><p className="muted">{t(lang, 'Your cart is taking a little breather. Let’s find someone a lovely surprise.', 'سلتك فارغة الآن. لنجد مفاجأة جميلة لشخص تحبه.')}</p><Link className="button" href="/occasions">{t(lang, 'Browse the boxes', 'تصفح الهدايا')}</Link></div></main>;
  return <><PageIntro eyebrow={t(lang, 'THE GOOD PART', 'الجزء الجميل')} title={t(lang, reviewing ? 'A few details, then we’re off.' : 'Your thoughtful picks.', reviewing ? 'بعض التفاصيل، ثم ننطلق.' : 'اختياراتك الجميلة.')} description={t(lang, reviewing ? 'Review your gift details, then pay securely with Stripe. Test mode is on: no real charges.' : 'Your cart is saved while you shop.', reviewing ? 'راجع تفاصيل الهدية ثم ادفع بأمان عبر Stripe. وضع الاختبار مفعّل، ولن يتم خصم مبالغ حقيقية.' : 'سلتك محفوظة أثناء التسوق.')} />
  <main className="container section"><div className="checkout-grid"><section className="panel">
    {hasUnavailable && <p className="cart-unavailable-notice" role="alert" data-testid="cart-unavailable-notice">
      {t(lang, 'Some saved gifts are no longer available. Your messages and dates are still saved. Remove unavailable gifts before checkout; they are not included in the total.', 'بعض الهدايا المحفوظة لم تعد متاحة. رسائلك وتواريخك ما زالت محفوظة. أزل الهدايا غير المتاحة قبل إتمام الطلب؛ فهي غير مشمولة في الإجمالي.')}
    </p>}
    {needsPriceReview && <section className="cart-unavailable-notice" role="alert" aria-labelledby="price-review-title" data-testid="cart-price-change-notice">
      <h2 id="price-review-title" style={{ fontSize: 24 }}>{t(lang, 'Please review the latest prices', 'يرجى مراجعة الأسعار الحالية')}</h2>
      <p>{t(lang, 'Saved gift prices have changed or need checking. Your messages and delivery dates are still saved. Review the current prices and updated total before confirming.', 'تغيّرت أسعار الهدايا المحفوظة أو تحتاج إلى مراجعة. رسائلك ومواعيد التوصيل ما زالت محفوظة. راجع الأسعار الحالية والإجمالي المحدّث قبل تأكيد الطلب.')}</p>
      <ul>
        {priceChanges.map(({ product, acknowledgedPrice }) => <li key={product!.id} data-testid={`price-change-${product!.id}`}>
          <strong>{t(lang, product!.name, product!.ar)}</strong>{': '}
          {hasSavedPrice(acknowledgedPrice)
            ? t(lang, `Previously ${fmt(acknowledgedPrice)} → Now ${fmt(product!.price)} per box`, `سابقاً ${fmt(acknowledgedPrice)} ← الآن ${fmt(product!.price)} للصندوق`)
            : t(lang, `Previous price not saved. Current price: ${fmt(product!.price)} per box`, `السعر السابق غير محفوظ. السعر الحالي: ${fmt(product!.price)} للصندوق`)}
        </li>)}
      </ul>
      <p><strong>{t(lang, 'Updated order total', 'إجمالي الطلب المحدّث')}: <bdi>{fmt(subtotal)}</bdi></strong></p>
      <button type="button" className="button secondary" disabled={hasUnavailable} onClick={() => acknowledgePrices(products)} data-testid="button-accept-prices">
        {t(lang, 'I’ve reviewed the updated total', 'راجعت الإجمالي المحدّث')}
      </button>
    </section>}
    {!reviewing ? <>
      <h2 style={{ fontSize: 27 }}>{t(lang, 'In your bag', 'في سلتك')}</h2>
      {enriched.map(({ productId, product, quantity, message, date }) => !product ? <div className="cart-row cart-row-unavailable" key={productId} data-testid={`cart-unavailable-${productId}`}>
        <div className="cart-row-art"><MiniGift /></div>
        <div>
          <h3>{t(lang, 'Unavailable gift box', 'صندوق هدايا غير متاح')}</h3>
          <p className="muted">{t(lang, 'Saved gift reference', 'مرجع الهدية المحفوظة')}: <bdi>{productId}</bdi></p>
          <p>{t(lang, 'This box is no longer available.', 'هذا الصندوق لم يعد متاحاً.')}</p>
          <GiftDetails message={message} date={date} productId={productId} />
          <p className="muted">{t(lang, 'Quantity', 'الكمية')}: {quantity}</p>
          <button className="remove" onClick={() => { removeItem(productId); setCheckout(false); }} data-testid={`button-cart-remove-${productId}`}>{t(lang, 'Remove', 'إزالة')}</button>
        </div>
      </div> : <div className="cart-row" key={product.id}>
        <div className="cart-row-art"><MiniGift /></div>
        <div>
          <h3>{t(lang, product!.name, product!.ar)}</h3>
          <div className="muted">{fmt(product!.price)}</div>
          <GiftDetails message={message} date={date} productId={product!.id} />
          <div className="qty">
            <button onClick={() => updateQty(product!.id, -1)} aria-label={t(lang, 'Decrease quantity', 'تقليل الكمية')} data-testid={`button-cart-decrease-${product!.id}`}><Minus size={16} /></button>
            <span>{quantity}</span>
            <button onClick={() => updateQty(product!.id, 1)} aria-label={t(lang, 'Increase quantity', 'زيادة الكمية')} data-testid={`button-cart-increase-${product!.id}`}><Plus size={16} /></button>
            <button className="remove" onClick={() => removeItem(product!.id)} data-testid={`button-cart-remove-${product!.id}`}>{t(lang, 'Remove', 'إزالة')}</button>
          </div>
        </div>
        <div className="price">{fmt(product!.price * quantity)}</div>
      </div>)}
      <div className="summary-line"><span>{t(lang, 'Subtotal', 'المجموع')}</span><span>{fmt(subtotal)}</span></div>
      <div className="summary-line muted"><span>{t(lang, 'Delivery', 'التوصيل')}</span><span>{deliveryFee === null ? t(lang, 'Loading…', 'جارٍ التحميل…') : fmt(deliveryFee)}</span></div>
      <div className="summary-line total"><span>{t(lang, 'Order total', 'إجمالي الطلب')}</span><span>{fmt(total)}</span></div>
      {deliveryFee === null && <p className="cart-unavailable-notice" role="status">{error || t(lang, 'Checking secure checkout availability…', 'جارٍ التحقق من توفر الدفع الآمن…')}</p>}
      <button className="button" style={{ width: '100%', marginTop: 18 }} disabled={hasUnavailable || deliveryFee === null} onClick={() => { if (!hasUnavailable && deliveryFee !== null) setCheckout(true); }} data-testid="button-continue-checkout">
        {t(lang, 'Continue to secure checkout', 'تابع إلى الدفع الآمن')} <ArrowRight size={18} />
      </button>
    </> : <>
      <section ref={checkoutReviewRef} className="checkout-review" aria-labelledby="checkout-review-title" data-testid="checkout-gift-review">
        <h2 id="checkout-review-title">{t(lang, 'Review your gift details', 'راجع تفاصيل هداياك')}</h2>
        <p className="muted">{t(lang, 'Check the card message and delivery date before confirming.', 'تأكد من رسالة البطاقة وموعد التوصيل قبل التأكيد.')}</p>
        <div className="checkout-review-list">
          {enriched.map(({ product, quantity, message, date }) => <article className="checkout-review-item" key={product!.id} data-testid={`review-gift-${product!.id}`}>
            <div className="checkout-review-heading">
              <h3>{t(lang, product!.name, product!.ar)} <span className="muted">× {quantity}</span></h3>
              <span className="price">{fmt(product!.price * quantity)}</span>
            </div>
            <GiftDetails message={message} date={date} productId={product!.id} />
          </article>)}
        </div>
      </section>
      <form onSubmit={checkoutSubmit} noValidate>
        <h2 style={{ fontSize: 27 }}>{t(lang, 'Where should it land?', 'إلى أين نرسلها؟')}</h2>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="field"><label htmlFor="checkout-email">{t(lang, 'Email for your receipt', 'البريد الإلكتروني للإيصال')} *</label><input id="checkout-email" name="email" type="email" required autoComplete="email" /></div>
        <div className="field"><label htmlFor="checkout-name">{t(lang, 'Your name', 'الاسم')} *</label><input id="checkout-name" name="name" required minLength={2} autoComplete="name" /></div>
        <div className="field"><label htmlFor="checkout-phone">{t(lang, 'Mobile number', 'رقم الهاتف')} *</label><input id="checkout-phone" name="phone" required type="tel" pattern="[+0-9 -]{8,16}" autoComplete="tel" placeholder="+965 5XXX XXXX" /></div>
        <div className="field"><label htmlFor="checkout-area">{t(lang, 'Governorate', 'المحافظة')} *</label><select id="checkout-area" name="area" required defaultValue=""><option value="" disabled>{t(lang, 'Choose an area', 'اختر المحافظة')}</option>{catalog.governorates.map(area => <option key={area}>{area}</option>)}</select></div>
        <div className="field"><label htmlFor="checkout-address">{t(lang, 'Area / block / street', 'المنطقة / القطعة / الشارع')} *</label><input id="checkout-address" name="address" required autoComplete="street-address" /></div>
        <div className="field"><label htmlFor="checkout-recipient">{t(lang, 'Recipient name (if different)', 'اسم المستلم (إن اختلف)')}</label><input id="checkout-recipient" name="recipient" /></div>
        <div className="summary-line"><span>{t(lang, 'Subtotal', 'المجموع')}</span><span>{fmt(subtotal)}</span></div>
        <div className="summary-line"><span>{t(lang, 'Delivery', 'التوصيل')}</span><span>{deliveryFee === null ? '—' : fmt(deliveryFee)}</span></div>
        <div className="summary-line total"><span>{t(lang, 'Total', 'الإجمالي')}</span><span>{fmt(total)}</span></div>
        <button className="button" type="submit" disabled={needsPriceReview || submitting || deliveryFee === null} data-testid="button-confirm-order">{submitting ? t(lang, 'Opening secure checkout…', 'جارٍ فتح الدفع الآمن…') : t(lang, 'Pay securely with Stripe', 'ادفع بأمان عبر Stripe')} <Check size={18} /></button>
        <button className="remove" type="button" onClick={() => setCheckout(false)}>{t(lang, 'Back to cart', 'العودة للسلة')}</button>
        <p className="muted" style={{ fontSize: 14, marginTop: 14 }}>{t(lang, 'Stripe test mode is on. No real charge will be made.', 'وضع اختبار Stripe مفعّل. لن يتم خصم أي مبلغ حقيقي.')}</p>
      </form>
    </>}
  </section><aside className="panel"><h3>{t(lang, 'A little reassurance', 'لراحة بالك')}</h3><p className="detail-benefit"><Check size={18} />{t(lang, 'Order by 3 PM for delivery tonight', 'اطلب قبل ٣ مساءً للتوصيل الليلة')}</p><p className="detail-benefit"><Check size={18} />{t(lang, 'Delivery to all six Kuwait governorates', 'توصيل إلى محافظات الكويت الست')}</p><p className="detail-benefit"><Check size={18} />{t(lang, 'Satisfaction promise: we’ll make it right', 'وعد الرضا: سنعالج أي مشكلة')}</p><div className="summary-line total"><span>{t(lang, 'Order total', 'إجمالي الطلب')}</span><span>{fmt(total)}</span></div></aside></div></main></>;
}
type PaymentOrderView = {
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  currency: 'kwd';
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: { productId: string; name: string; nameAr: string; quantity: number; unitPrice: number; message: string; date: string }[];
};
function CheckoutReturn() {
  const { lang } = useStore();
  const [order, setOrder] = useState<PaymentOrderView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    const accessToken = params.get('access_token');
    const sessionId = params.get('session_id');
    if (!orderId || !accessToken || !sessionId) {
      setError(t(lang, 'This payment link is incomplete. Your cart is still saved.', 'رابط الدفع غير مكتمل. سلتك ما زالت محفوظة.'));
      return;
    }
    let active = true;
    let attempts = 0;
    let timer: number | undefined;
    const checkPayment = async () => {
      try {
        const response = await fetch(paymentApiUrl('payments/order-status'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, accessToken, sessionId }),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Payment status could not be checked.');
        const result = await response.json() as PaymentOrderView;
        if (!active) return;
        setOrder(result);
        if (result.status === 'paid') {
          try {
            const snapshotText = sessionStorage.getItem(`tawwa-order-cart:${result.orderId}`);
            const purchased = snapshotText ? JSON.parse(snapshotText) as CartItem[] : [];
            const saved = JSON.parse(localStorage.getItem('tawwa-cart') || '[]') as CartItem[];
            const remaining = [...saved];
            for (const item of purchased) {
              const index = remaining.findIndex(current =>
                current.productId === item.productId &&
                (current.message ?? '') === (item.message ?? '') &&
                (current.date ?? '') === (item.date ?? '')
              );
              if (index < 0) continue;
              if (remaining[index].quantity <= item.quantity) remaining.splice(index, 1);
              else remaining[index] = { ...remaining[index], quantity: remaining[index].quantity - item.quantity };
            }
            localStorage.setItem('tawwa-cart', JSON.stringify(remaining));
            sessionStorage.removeItem(`tawwa-order-cart:${result.orderId}`);
            window.dispatchEvent(new Event('tawwa-cart-update'));
          } catch {
            // A storage restriction must not hide a verified successful payment.
          }
          return;
        }
        if (result.status === 'pending' && attempts++ < 18) timer = window.setTimeout(checkPayment, 2500);
      } catch {
        if (!active) return;
        setError(t(lang, 'We couldn’t confirm the payment yet. Your gift details are still saved. Refresh to check again.', 'لم نتمكن من تأكيد الدفع بعد. تفاصيل الهدية ما زالت محفوظة. حدّث الصفحة للتحقق مجدداً.'));
      }
    };
    void checkPayment();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [lang]);
  const paid = order?.status === 'paid';
  return <main className="container success-panel" aria-live="polite">
    <div className="success-mark">{paid ? <Check size={36} /> : <GiftMark decorative />}</div>
    <div className="eyebrow">{t(lang, paid ? 'PAYMENT CONFIRMED' : 'VERIFYING PAYMENT', paid ? 'تم تأكيد الدفع' : 'جارٍ التحقق من الدفع')}</div>
    <h1 style={{ fontSize: 42 }}>{paid
      ? t(lang, 'Your gift is on its way.', 'توّا وتوصلك الهدية.')
      : order?.status === 'failed' || order?.status === 'expired'
        ? t(lang, 'Payment wasn’t completed.', 'لم يكتمل الدفع.')
        : t(lang, 'Checking your payment…', 'جارٍ التحقق من الدفع…')}</h1>
    <p className="muted">{error || (paid
      ? t(lang, 'Your payment is confirmed. We saved your card message and delivery date with the order.', 'تم تأكيد الدفع. حفظنا رسالة البطاقة وموعد التوصيل مع الطلب.')
      : order?.status === 'failed' || order?.status === 'expired'
        ? t(lang, 'Your cart is unchanged. Return to it to try again.', 'سلتك كما هي. عد إليها للمحاولة مجدداً.')
        : t(lang, 'Your cart stays saved until Stripe confirms payment.', 'ستبقى سلتك محفوظة حتى يؤكد Stripe الدفع.'))}</p>
    {order && <section className="panel" style={{ textAlign: 'start', marginTop: 24 }}>
      <h2>{t(lang, 'Order details', 'تفاصيل الطلب')}</h2>
      {order.items.map(item => <article className="checkout-review-item" key={item.productId}>
        <div className="checkout-review-heading"><h3>{t(lang, item.name, item.nameAr)} × {item.quantity}</h3><span>{fmt(item.unitPrice * item.quantity)}</span></div>
        <GiftDetails message={item.message} date={item.date} productId={`order-${item.productId}`} />
      </article>)}
      <div className="summary-line"><span>{t(lang, 'Delivery', 'التوصيل')}</span><span>{fmt(order.deliveryFee)}</span></div>
      <div className="summary-line total"><span>{t(lang, 'Order total', 'إجمالي الطلب')}</span><span>{fmt(order.total)}</span></div>
    </section>}
    <Link className="button" href={paid ? '/' : '/cart'}>{t(lang, paid ? 'Back to Tawwa' : 'Return to cart', paid ? 'العودة إلى توّا' : 'العودة إلى السلة')}</Link>
  </main>;
}
function FAQ() {
  const { lang } = useStore();
  const [open, setOpen] = useState(0);
  return <><PageIntro eyebrow={t(lang, 'DELIVERY, WITHOUT THE MYSTERY', 'التوصيل ببساطة')} title={t(lang, 'A few good answers.', 'إجابات على أسئلتك.')} description={t(lang, 'Good gifts should come with clear details. Here’s how Tawwa gets yours there.', 'الهدية الجميلة تبدأ بتفاصيل واضحة. إليك كيف نوصلها إليك.')} /><main className="container faq-list">{catalog.faqs.map((item,i) => <div className="faq-item" key={item.q}><button className="faq-question" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{t(lang,item.q,item.qa)}{open === i ? <Minus size={20} /> : <Plus size={20} />}</button>{open === i && <div className="faq-answer">{t(lang,item.a,item.aa)}</div>}</div>)}<section className="contact-card" style={{ marginTop: 44 }}><h2 style={{ fontSize: 28 }}>{t(lang, 'Still wondering?', 'هل لديك سؤال آخر؟')}</h2><p>{t(lang, 'A real person is happy to help with your gift or delivery question.', 'يسعدنا مساعدتك في أي سؤال عن الهدية أو التوصيل.')}</p><Link className="button secondary" href="/contact">{t(lang, 'Talk to us', 'تواصل معنا')} <MessageCircle size={18} /></Link></section></main></>;
}
function Contact() {
  const { lang, toast } = useStore();
  const [submitted, setSubmitted] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!e.currentTarget.reportValidity()) return; setSubmitted(true); toast(t(lang,'Message noted. Our demo inbox is happy.','وصلتنا رسالتك التجريبية.')); };
  return <><PageIntro eyebrow={t(lang, 'A HUMAN HELLO', 'مرحباً بك')} title={t(lang, 'We’re right here.', 'نحن هنا لمساعدتك.')} description={t(lang, 'Last-minute question? Gift dilemma? We’re a message away.', 'سؤال مستعجل؟ محتار بالهدية؟ نحن على بُعد رسالة.')} /><main className="container section contact-grid"><section className="contact-card"><div className="eyebrow">{t(lang, 'QUICKEST WAY', 'أسرع طريقة')}</div><h2 style={{ fontSize: 30 }}>{t(lang, 'Say it on WhatsApp.', 'راسلنا على واتساب.')}</h2><p>{t(lang, 'For delivery timing, gift ideas, or a quick bit of reassurance.', 'للتأكد من موعد التوصيل أو أفكار الهدايا أو لأي استفسار سريع.')}</p><a className="button secondary" href="https://wa.me/?text=Hello%20Tawwa" target="_blank" rel="noreferrer"><MessageCircle size={19} />{t(lang, 'Message Tawwa', 'راسل توّا')}</a><div className="detail-benefit" style={{ marginTop: 24 }}><Check size={18} />{t(lang, 'We reply as soon as we can, every day.', 'نرد عليك بأسرع وقت كل يوم.')}</div></section><section className="panel">{submitted ? <div className="success-panel" style={{ padding: '30px 0' }}><div className="success-mark"><Check /></div><h2>{t(lang, 'Message received.', 'وصلتنا رسالتك.')}</h2><p className="muted">{t(lang, 'Thanks for reaching out. This demo form doesn’t send to a live inbox.', 'شكراً لتواصلك. هذا النموذج التجريبي لا يرسل الرسائل إلى بريد حقيقي.')}</p><button className="button outline" onClick={() => setSubmitted(false)}>{t(lang, 'Send another', 'أرسل رسالة أخرى')}</button></div> : <form onSubmit={submit}><h2 style={{ fontSize: 28 }}>{t(lang, 'Or leave us a note.', 'أو اترك لنا رسالة.')}</h2><div className="field"><label htmlFor="contact-name">{t(lang, 'Your name', 'الاسم')} *</label><input id="contact-name" required autoComplete="name" /></div><div className="field"><label htmlFor="contact-email">{t(lang, 'Email', 'البريد الإلكتروني')} *</label><input id="contact-email" type="email" required autoComplete="email" /></div><div className="field"><label htmlFor="contact-message">{t(lang, 'What’s on your mind?', 'كيف نقدر نساعدك؟')} *</label><textarea id="contact-message" required minLength={8} /></div><button className="button" type="submit">{t(lang, 'Send message', 'إرسال الرسالة')} <ArrowRight size={18} /></button></form>}</section></main></>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function InnerApp() {
  const [lang, setLang] = useState<'en' | 'ar'>(() => (localStorage.getItem('tawwa-lang') === 'ar' ? 'ar' : 'en'));
  const [cart, setCart] = useCart();
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('tawwa-lang', lang); }, [lang]);
  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [toastMessage]);
  const store = useMemo<StoreValue>(() => ({
    lang, setLang,
    cart,
    addItem: (productId, price, messageText, date) => setCart(old => { const existing = old.find(i => i.productId === productId); return existing ? old.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1, message: messageText || i.message, date: date || i.date } : i) : [...old, { productId, quantity: 1, message: messageText, date, acknowledgedPrice: price }]; }),
    acknowledgePrices: products => setCart(old => old.map(item => {
      const product = products.find(p => p.id === item.productId);
      return product ? { ...item, acknowledgedPrice: product.price } : item;
    })),
    updateQty: (id, delta) => setCart(old => old.map(i => i.productId === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0)),
    removeItem: id => setCart(old => old.filter(i => i.productId !== id)),
    toast: (text, action) => setToastMessage({ text, action })
  }), [lang, cart, setCart]);
  return <Store.Provider value={store}><div className="app-shell"><Header /><RoutedErrorBoundary><Switch>
    <Route path="/checkout/return" component={CheckoutReturn} />
    <Route><CatalogProvider lang={lang}><Switch>
      <Route path="/" component={Home} /><Route path="/occasions" component={Shop} /><Route path="/product/:id" component={ProductPage} /><Route path="/gift-finder" component={GiftFinder} /><Route path="/cart" component={Cart} /><Route path="/faq" component={FAQ} /><Route path="/contact" component={Contact} /><Route component={NotFound} />
    </Switch></CatalogProvider></Route>
  </Switch></RoutedErrorBoundary><Footer /><Intro />{toastMessage && <div className="toast-message" role="status" aria-live="polite" data-testid="status-toast">
    <span>{toastMessage.text}</span>
    {toastMessage.action && <Link className="toast-action" href={toastMessage.action.href} data-testid="link-toast-action">{toastMessage.action.label}</Link>}
  </div>}</div></Store.Provider>;
}
const queryClient = new QueryClient();
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Switch><Route path="/admin" component={AdminPage} /><Route><InnerApp /></Route></Switch></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
