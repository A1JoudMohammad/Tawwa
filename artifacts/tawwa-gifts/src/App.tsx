import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, useRoute, Router as WouterRouter, Link } from 'wouter';
import { ArrowRight, ArrowUpRight, Award, Check, ChevronLeft, ChevronRight, Gift, Heart, Menu, MessageCircle, Minus, Moon, Plus, Sparkles, Sun, X } from 'lucide-react';
import catalog from './data/catalog.json';

type Product = (typeof catalog.products)[number];
type CartItem = { productId: string; quantity: number; message?: string; date?: string };
type StoreValue = { lang: 'en' | 'ar'; setLang: (lang: 'en' | 'ar') => void; cart: CartItem[]; addItem: (productId: string, message?: string, date?: string) => void; updateQty: (id: string, delta: number) => void; removeItem: (id: string) => void; toast: (message: string) => void };
const Store = createContext<StoreValue | null>(null);
const useStore = () => {
  const value = useContext(Store);
  if (!value) throw new Error('Tawwa store is unavailable');
  return value;
};
const products = catalog.products as Product[];
const fmt = (amount: number) => `${amount.toFixed(3)} KWD`;
const t = (lang: 'en' | 'ar', en: string, ar: string) => lang === 'ar' ? ar : en;

function GiftMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 96" role="img" aria-label="Tawwa gift box mark" xmlns="http://www.w3.org/2000/svg"><g className="speed-lines" fill="none" stroke="#C25A30" strokeWidth="5" strokeLinecap="round"><path d="M6 50h20M2 64h24M10 78h16"/></g><g transform="rotate(-5 72 62)"><rect x="40" y="46" width="64" height="44" rx="8" fill="#1F6F6B"/><rect x="35" y="34" width="74" height="16" rx="6" fill="#D9B991"/><rect x="65" y="34" width="14" height="56" fill="#C25A30"/><path d="M72 34C60 14 42 22 52 32C57 36 66 35 72 34Z" fill="#C25A30"/><path d="M72 34C84 14 102 22 92 32C87 36 78 35 72 34Z" fill="#C25A30"/><rect x="66" y="29" width="12" height="9" rx="4" fill="#C25A30"/></g></svg>;
}
function Wordmark() {
  return <span className="brand-name"><span>Tawwa</span><span>توّا</span></span>;
}
function MiniGift() { return <div className="mini-gift" aria-hidden="true"><span className="mini-ribbon" /></div>; }
function ProductArt({ product, className = '' }: { product?: Product; className?: string }) {
  return <div className={`product-card-image ${className}`} role="img" aria-label={product ? `${product.name} illustrated gift box` : 'Illustrated Tawwa gift box'}><MiniGift /></div>;
}
function ProductCard({ product }: { product: Product }) {
  const { lang } = useStore();
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
  const scrollByCard = (direction: number) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.product-card');
    el.scrollBy({ left: direction * ((card?.offsetWidth || 300) + 20) * (lang === 'ar' ? -1 : 1), behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.product-card');
    if (card) setActive(Math.round(Math.abs(el.scrollLeft) / (card.offsetWidth + 20)));
  };
  return <div className="carousel-wrap">
    <div className="carousel" ref={ref} onScroll={onScroll} tabIndex={0} aria-label="Featured gift boxes. Scroll horizontally to explore." onKeyDown={e => { if (e.key === 'ArrowRight') scrollByCard(lang === 'ar' ? -1 : 1); if (e.key === 'ArrowLeft') scrollByCard(lang === 'ar' ? 1 : -1); }}>
      {items.map(item => <ProductCard key={item.id} product={item} />)}
    </div>
    <div className="section-head" style={{ margin: '8px 0 0', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 10 }}><button className="carousel-control" onClick={() => scrollByCard(-1)} aria-label="Previous gifts"><ChevronLeft /></button><button className="carousel-control" onClick={() => scrollByCard(1)} aria-label="Next gifts"><ChevronRight /></button></div>
      <div className="dots" aria-label="Carousel pages">{items.map((item, i) => <button key={item.id} className={`dot ${i === active ? 'active' : ''}`} aria-label={`Go to gift ${i + 1}`} onClick={() => { const el = ref.current; const card = el?.querySelector<HTMLElement>('.product-card'); el?.scrollTo({ left: (card ? card.offsetWidth + 20 : 320) * i * (lang === 'ar' ? -1 : 1), behavior: 'smooth' }); }} />)}</div>
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
        <div><h3>{t(lang, 'HERE TO HELP', 'نحن هنا للمساعدة')}</h3><div className="footer-links"><Link href="/faq">{t(lang, 'Delivery & FAQ', 'التوصيل والأسئلة')}</Link><Link href="/contact">{t(lang, 'Contact us', 'تواصل معنا')}</Link><a href="https://wa.me/?text=Hello%20Tawwa" target="_blank" rel="noreferrer">WhatsApp</a></div></div>
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
  const { lang } = useStore();
  const [testimonial, setTestimonial] = useState(0);
  const occasions = catalog.occasions.slice(0, 8);
  const iconFor = (icon: string) => icon === 'heart' ? <Heart /> : icon === 'sun' ? <Sun /> : icon === 'award' ? <Award /> : icon === 'moon' ? <Moon /> : icon === 'sparkles' ? <Sparkles /> : <Gift />;
  return <>
    <div className="announcement">{lang === 'ar' ? <>اطلب قبل <strong>٣ مساءً</strong> لتوصيل الليلة. تأخرت؟ نحن معك.</> : <>Order by <strong>3 PM</strong>, delivered tonight. Last-minute? We’ve got you.</>}</div>
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div><div className="eyebrow">{t(lang, 'KUWAIT GIFTING, RIGHT ON TIME', 'هدايا الكويت، في وقتها')}</div><h1>{lang === 'ar' ? <>عيد الميلاد الليلة؟<br /><em>خذ نفساً. توّا تتكفل.</em></> : <>Birthday tonight?<br /><em>Breathe. Tawwa’s on it.</em></>}</h1><p className="hero-copy">{t(lang, 'Thoughtful gift boxes, ready to go. Pick a moment, add your words, and we’ll get it there—fast.', 'صناديق هدايا جاهزة ومختارة بعناية. اختر المناسبة، أضف كلماتك، وسنوصلها بسرعة.')}</p><Link className="button" href="/gift-finder">{t(lang, 'Find the perfect box', 'اعثر على الهدية المناسبة')} <ArrowRight size={18} /></Link><div className="detail-benefit"><Check size={18} />{t(lang, 'Same-day delivery across Kuwait', 'توصيل في نفس اليوم إلى جميع أنحاء الكويت')}</div></div>
          <div className="hero-visual" aria-label="Tawwa gift box illustration"><div className="hero-note">{t(lang, 'Just in time.', 'في وقتها تماماً.')}</div><div className="gift-art"><div className="orbit" /><div className="box"><span className="lid" /><span className="ribbon" /><span className="bow" /></div></div><span className="hero-spark one">✳</span><span className="hero-spark two">✳</span></div>
        </div>
      </section>
      <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">{t(lang, 'START WITH THE MOMENT', 'ابدأ بالمناسبة')}</div><h2>{t(lang, 'What are we celebrating?', 'ما المناسبة التي نحتفل بها؟')}</h2></div><Link href="/occasions" className="button outline small">{t(lang, 'All occasions', 'كل المناسبات')} <ArrowUpRight size={16} /></Link></div>
        <div className="occasion-grid">{occasions.map((o, i) => <Link key={o.id} className="occasion-tile" href={`/occasions?occasion=${o.id}`}><span className="occasion-icon">{iconFor(o.icon)}</span><h3>{t(lang, o.name, o.ar)}{o.placeholder && <span style={{ fontSize: 12, display: 'block', fontWeight: 400 }}>{t(lang, 'Coming soon', 'قريباً')}</span>}</h3></Link>)}</div>
      </div></section>
      <section className="container"><div className="fast-strip"><div><div className="eyebrow">{t(lang, 'A LITTLE URGENCY, A LOT OF RELIEF', 'استعجال بسيط وراحة كبيرة')}</div><h2>{t(lang, 'Need it fast? We move fast.', 'تحتاجها بسرعة؟ نحن جاهزون.')}</h2><p style={{ margin: 0 }}>{t(lang, 'Order by 3 PM and we’ll deliver tonight. No frantic mall laps required.', 'اطلب قبل ٣ مساءً ونوصلها الليلة. لا حاجة لجولة متوترة في السوق.')}</p></div><Link className="button" href="/occasions">{t(lang, 'Shop ready-to-go', 'تسوق الهدايا الجاهزة')} <ArrowRight size={18} /></Link></div></section>
      <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">{t(lang, 'READY WHEN YOU ARE', 'جاهزة وقتما تحتاج')}</div><h2>{t(lang, 'The crowd favourites', 'اختيارات محبوبة')}</h2><p className="muted">{t(lang, 'Hand-picked boxes for the moments that sneak up on you.', 'هدايا مختارة بعناية للمناسبات التي تأتي فجأة.')}</p></div><Link href="/occasions" className="button outline small">{t(lang, 'Shop all', 'تسوق الكل')}</Link></div><Carousel items={products.slice(0, 7)} /></div></section>
      <section className="section" id="how-it-works" style={{ background: '#f0e9de' }}><div className="container"><div className="eyebrow">{t(lang, 'THREE EASY STEPS', 'ثلاث خطوات سهلة')}</div><h2>{t(lang, 'You bring the moment. We’ll bring the box.', 'أنت تختار المناسبة، ونحن نحضر الهدية.')}</h2><div className="steps" style={{ marginTop: 48 }}><div className="step"><div className="step-number">01 / PICK</div><h3>{t(lang, 'Pick the moment', 'اختر المناسبة')}</h3><p className="muted">{t(lang, 'Birthdays, new arrivals, fresh starts—or just because. Start with who you’re celebrating.', 'أعياد ميلاد، مواليد جدد، بدايات جديدة، أو بلا مناسبة. ابدأ بمن تحتفل به.')}</p></div><div className="step"><div className="step-number">02 / PERSONALISE</div><h3>{t(lang, 'Add your words', 'أضف كلماتك')}</h3><p className="muted">{t(lang, 'Write a note that sounds like you. We’ll tuck it into the box.', 'اكتب رسالة تعبّر عنك، وسنضعها داخل الصندوق.')}</p></div><div className="step"><div className="step-number">03 / WE DELIVER</div><h3>{t(lang, 'We’ll get it there', 'نوصلها بالنيابة عنك')}</h3><p className="muted">{t(lang, 'Choose a delivery date. We’ll take it from here—with updates along the way.', 'اختر موعد التوصيل، واترك الباقي علينا مع تحديثات مستمرة.')}</p></div></div></div></section>
      <section className="testimonials"><div className="container"><div className="eyebrow" style={{ textAlign: 'center' }}>{t(lang, 'KIND WORDS, RIGHT ON TIME', 'كلمات جميلة في وقتها')}</div><h2 style={{ textAlign: 'center', marginBottom: 36 }}>{t(lang, 'They had a moment. We had the box.', 'كان لديهم مناسبة، وكانت الهدية جاهزة.')}</h2><div className="quote">“{t(lang, catalog.testimonials[testimonial].quote, catalog.testimonials[testimonial].ar)}”<div className="quote-by">{catalog.testimonials[testimonial].name} · {catalog.testimonials[testimonial].place}</div></div><div className="dots" style={{ marginTop: 30 }}>{catalog.testimonials.map((item, i) => <button key={item.name} className={`dot ${testimonial === i ? 'active' : ''}`} aria-label={`Testimonial ${i + 1}`} aria-pressed={testimonial === i} onClick={() => setTestimonial(i)} />)}</div></div></section>
      <section className="section"><div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}><div><div className="eyebrow">{t(lang, 'A PROMISE, NOT A POSTER', 'وعدنا لك')}</div><h2>{t(lang, 'Your gift should feel just right.', 'نريد أن تكون هديتك كما تمنيتها.')}</h2><p className="muted">{t(lang, 'If something arrives damaged or not as expected, talk to us. We’ll make it right.', 'إذا وصل شيء تالفاً أو مختلفاً، تواصل معنا وسنعالج الأمر.')}</p></div><Link className="button secondary" href="/faq">{t(lang, 'Our satisfaction promise', 'وعدنا برضاك')} <ArrowRight size={18} /></Link></div></section>
    </main>
  </>;
}
function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <section className="page-intro"><div className="container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p style={{ maxWidth: 680, margin: 0 }}>{description}</p>}</div></section>;
}
function Shop() {
  const { lang } = useStore();
  const params = new URLSearchParams(window.location.search);
  const [occasion, setOccasion] = useState(params.get('occasion') || 'all');
  const [age, setAge] = useState('all');
  const [budget, setBudget] = useState('all');
  const [speed, setSpeed] = useState('all');
  const filtered = useMemo(() => products.filter(p => (occasion === 'all' || p.occasion === occasion) && (age === 'all' || p.age === age) && (budget === 'all' || (budget === 'under25' ? p.price < 25 : budget === '25to35' ? p.price >= 25 && p.price <= 35 : p.price > 35)) && (speed === 'all' || (speed === 'tonight' ? p.delivery.toLowerCase().includes('tonight') : p.delivery.toLowerCase().includes('same-day')))), [occasion, age, budget, speed]);
  const occasionName = catalog.occasions.find(o => o.id === occasion);
  return <><PageIntro eyebrow={t(lang, 'OCCASION FIRST', 'المناسبة أولاً')} title={t(lang, occasionName?.name || 'Find the right kind of lovely.', occasionName?.ar || 'اعثر على الهدية المناسبة.')} description={t(lang, 'Ready-made gifts for the people and moments that matter. Filter it down, then leave the wrapping to us.', 'هدايا جاهزة للأشخاص والمناسبات المهمة. اختر ما يناسبك واترك التغليف علينا.')} />
    <main className="section"><div className="container shop-layout"><aside className="filters" aria-label="Product filters">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3>{t(lang, 'Make it a match', 'اختر ما يناسبك')}</h3><button className="remove" onClick={() => { setOccasion('all'); setAge('all'); setBudget('all'); setSpeed('all'); }}>{t(lang, 'Reset', 'إعادة')}</button></div>
      <div className="filter-group"><h3>{t(lang, 'Occasion', 'المناسبة')}</h3>{catalog.occasions.map(o => <label key={o.id}><input type="radio" name="occasion" checked={occasion === o.id} onChange={() => setOccasion(o.id)} />{t(lang, o.name, o.ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Budget', 'الميزانية')}</h3>{[['all','Any budget','أي ميزانية'],['under25','Under 25 KWD','أقل من ٢٥ د.ك'],['25to35','25–35 KWD','٢٥–٣٥ د.ك'],['over35','Over 35 KWD','أكثر من ٣٥ د.ك']].map(([v,en,ar]) => <label key={v}><input type="radio" name="budget" checked={budget === v} onChange={() => setBudget(v)} />{t(lang,en,ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Age group', 'الفئة العمرية')}</h3>{[['all','Any age','كل الأعمار'],['3-6','Ages 3–6','الأعمار ٣–٦'],['7-12','Ages 7–12','الأعمار ٧–١٢']].map(([v,en,ar]) => <label key={v}><input type="radio" name="age" checked={age === v} onChange={() => setAge(v)} />{t(lang,en,ar)}</label>)}</div>
      <div className="filter-group"><h3>{t(lang, 'Delivery speed', 'سرعة التوصيل')}</h3>{[['all','Any delivery','كل الخيارات'],['tonight','Tonight','الليلة'],['same','Same day','نفس اليوم']].map(([v,en,ar]) => <label key={v}><input type="radio" name="speed" checked={speed === v} onChange={() => setSpeed(v)} />{t(lang,en,ar)}</label>)}</div>
    </aside><div><p className="muted" aria-live="polite">{t(lang, `${filtered.length} thoughtful boxes`, `${filtered.length} هدية مختارة`)}</p>{filtered.length ? <div className="shop-products">{filtered.map(p => <ProductCard key={p.id} product={p} />)}</div> : <div className="empty-state"><Gift size={42} className="empty-state-mark" /><h2>{t(lang, 'A little too specific?', 'هل اخترت تفاصيل كثيرة؟')}</h2><p>{t(lang, 'Try loosening a filter and we’ll find your gift.', 'خفف بعض الخيارات وسنجد الهدية المناسبة.')}</p><button className="button" onClick={() => { setAge('all'); setBudget('all'); setSpeed('all'); }}>{t(lang, 'Clear filters', 'مسح الخيارات')}</button></div>}</div></div></main></>;
}
function ProductPage() {
  const { lang, addItem, toast } = useStore();
  const [, params] = useRoute('/product/:id');
  const product = products.find(p => p.id === params?.id);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState(0);
  if (!product) return <NotFound />;
  const add = () => { addItem(product.id, message, date); toast(t(lang, `${product.name} is in your cart.`, `${product.ar} أضيفت إلى سلتك.`)); };
  return <><main className="section"><div className="container product-layout">
    <div className="product-gallery"><div className="gallery-main" aria-label={`${product.name} product illustration`} style={{ background: selected === 1 ? '#d9e6df' : selected === 2 ? '#f0dfd4' : '#eee4d6' }}><MiniGift /></div><div className="gallery-thumbs">{[0,1,2].map(i => <button className={`gallery-thumb ${selected === i ? 'selected' : ''}`} onClick={() => setSelected(i)} aria-label={`Show product view ${i + 1}`} key={i}><MiniGift /></button>)}</div></div>
    <div className="product-detail"><div className="eyebrow">{t(lang, catalog.occasions.find(o => o.id === product.occasion)?.name || 'GIFT BOX', catalog.occasions.find(o => o.id === product.occasion)?.ar || 'هدية')}</div><h1>{t(lang, product.name, product.ar)}</h1><div className="price">{fmt(product.price)}</div><p className="muted" style={{ marginTop: 18 }}>{t(lang, product.description, product.descriptionAr)}</p><div className="detail-benefit"><Check size={18} />{t(lang, product.idealFor, product.idealForAr)}</div><div className="detail-benefit"><Check size={18} />{t(lang, product.delivery, product.deliveryAr)}</div>
      <div className="contents"><h3>{t(lang, 'Inside the box', 'محتويات الصندوق')}</h3><ul>{(lang === 'ar' ? product.contentsAr : product.contents).map(item => <li key={item}>{item}</li>)}</ul></div>
      <div className="product-options"><div className="field"><label htmlFor="gift-message">{t(lang, 'Your card message', 'رسالة البطاقة')} <span className="muted">({t(lang, 'optional', 'اختياري')})</span></label><textarea id="gift-message" maxLength={180} value={message} onChange={e => setMessage(e.target.value)} placeholder={t(lang, 'A few words from you…', 'اكتب كلماتك هنا...')} /><span className="muted">{message.length}/180</span></div><div className="field"><label htmlFor="delivery-date">{t(lang, 'Delivery date', 'تاريخ التوصيل')}</label><input id="delivery-date" type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={e => setDate(e.target.value)} /></div><button className="button" onClick={add}>{t(lang, 'Add to cart', 'أضف إلى السلة')} <Gift size={18} /></button><div className="detail-benefit"><Check size={18} />{t(lang, 'Your order is confirmed before any payment. Demo checkout only.', 'تأكيد الطلب قبل الدفع. تجربة توضيحية فقط.')}</div></div>
    </div>
  </div></main><div className="mobile-sticky-cta"><span className="price">{fmt(product.price)}</span><button className="button" onClick={add}>{t(lang, 'Add to cart', 'أضف إلى السلة')}</button></div></>;
}
function GiftFinder() {
  const { lang } = useStore();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ occasion: '', recipient: '', budget: '', date: '' });
  const [complete, setComplete] = useState(false);
  const questions = [
    { key: 'occasion', title: t(lang, 'What’s the occasion?', 'ما المناسبة؟'), choices: catalog.occasions.slice(0, 8).map(o => ({ id: o.id, label: t(lang, o.name, o.ar) })) },
    { key: 'recipient', title: t(lang, 'Who’s getting the good stuff?', 'لمن هذه الهدية؟'), choices: [{id:'child',label:t(lang,'A kid','طفل')},{id:'newborn',label:t(lang,'New mum or newborn','أم أو مولود جديد')},{id:'retiree',label:t(lang,'Someone retiring','شخص متقاعد')},{id:'friend',label:t(lang,'A friend or family','صديق أو فرد من العائلة')}] },
    { key: 'budget', title: t(lang, 'What feels right?', 'ما الميزانية المناسبة؟'), choices: [{id:'under25',label:t(lang,'Under 25 KWD','أقل من ٢٥ د.ك')},{id:'25to35',label:t(lang,'25–35 KWD','٢٥–٣٥ د.ك')},{id:'over35',label:t(lang,'Over 35 KWD','أكثر من ٣٥ د.ك')}] }
  ];
  const answer = (key: keyof typeof answers, value: string) => setAnswers({ ...answers, [key]: value });
  const recipientOccasion = answers.recipient === 'child' ? 'kids' : answers.recipient === 'newborn' ? 'newborn' : answers.recipient === 'retiree' ? 'retirement' : '';
  const results = products.filter(p => (!answers.occasion || p.occasion === answers.occasion) && (!recipientOccasion || p.occasion === recipientOccasion) && (!answers.budget || (answers.budget === 'under25' ? p.price < 25 : answers.budget === '25to35' ? p.price >= 25 && p.price <= 35 : p.price > 35)));
  const current = questions[step];
  return <><PageIntro eyebrow={t(lang, 'A VERY SHORT QUIZ', 'اختبار سريع')} title={t(lang, 'We’ll find the one.', 'سنجد الهدية المناسبة.')} description={t(lang, 'Four little questions. No overthinking required.', 'أربع أسئلة بسيطة. لا داعي للتفكير كثيراً.')} /><main className="container">{!complete ? <div className="quiz-panel"><div className="progress-track" aria-label={`Step ${step + 1} of 4`}><span style={{ width: `${(step + 1) * 25}%` }} /></div>{step < 3 ? <><div className="eyebrow">{t(lang, `QUESTION 0${step + 1} / 04`, `السؤال ٠${step + 1} / ٠٤`)}</div><h2>{current.title}</h2><div className="choice-grid">{current.choices.map(choice => <button key={choice.id} className={`choice ${answers[current.key as keyof typeof answers] === choice.id ? 'selected' : ''}`} onClick={() => answer(current.key as keyof typeof answers, choice.id)}>{choice.label}</button>)}</div><div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><button className="button outline" disabled={step === 0} onClick={() => setStep(step - 1)}>{t(lang, 'Back', 'السابق')}</button><button className="button" disabled={!answers[current.key as keyof typeof answers]} onClick={() => setStep(step + 1)}>{t(lang, 'Next', 'التالي')} <ArrowRight size={18} /></button></div></> : <><div className="eyebrow">{t(lang, 'QUESTION 04 / 04', 'السؤال ٠٤ / ٠٤')}</div><h2>{t(lang, 'When should it arrive?', 'متى تريد وصولها؟')}</h2><div className="field"><label htmlFor="finder-date">{t(lang, 'Delivery date', 'تاريخ التوصيل')}</label><input id="finder-date" type="date" min={new Date().toISOString().slice(0,10)} value={answers.date} onChange={e => answer('date',e.target.value)} /></div><div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><button className="button outline" onClick={() => setStep(2)}>{t(lang, 'Back', 'السابق')}</button><button className="button" onClick={() => setComplete(true)}>{t(lang, 'Show my gifts', 'اعرض الهدايا')} <ArrowRight size={18} /></button></div></>}</div> : <div className="section"><div className="section-head"><div><div className="eyebrow">{t(lang, 'YOUR SHORTLIST', 'اختياراتك')}</div><h2>{t(lang, 'Good picks. You’ve got this.', 'اختيارات جميلة. أنت قادر على ذلك.')}</h2><p className="muted">{t(lang, 'A few boxes that fit the moment. Choose your favourite.', 'بعض الهدايا المناسبة للمناسبة. اختر ما يعجبك.')}</p></div><button className="button outline small" onClick={() => {setStep(0);setComplete(false);}}>{t(lang,'Start again','ابدأ من جديد')}</button></div>{results.length ? <div className="shop-products">{results.slice(0,4).map(p => <ProductCard key={p.id} product={p} />)}</div> : <div className="empty-state"><p>{t(lang, 'We’re still curating that occasion. Browse all boxes for now.', 'نعمل على تجهيز هدايا هذه المناسبة. تصفح كل الهدايا الآن.')}</p><Link className="button" href="/occasions">{t(lang, 'Browse occasions','تصفح المناسبات')}</Link></div>}</div>}</main></>;
}
function Cart() {
  const { lang, cart, updateQty, removeItem, addItem, toast } = useStore();
  const [checkout, setCheckout] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState('');
  const enriched = cart.map(item => ({ ...item, product: products.find(p => p.id === item.productId) })).filter(item => item.product);
  const subtotal = enriched.reduce((sum, item) => sum + item.product!.price * item.quantity, 0);
  const checkoutSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const form = e.currentTarget;
    if (!form.reportValidity()) { setError(t(lang, 'Please check the highlighted details.', 'يرجى التأكد من البيانات المطلوبة.')); return; }
    const id = `TW-${Math.floor(100000 + Math.random() * 899999)}`;
    setOrderId(id); setConfirmed(true); localStorage.removeItem('tawwa-cart');
    window.dispatchEvent(new Event('tawwa-cart-update'));
  };
  if (confirmed) return <main className="container success-panel"><div className="success-mark"><Check size={36} /></div><div className="eyebrow">{t(lang, 'ORDER CONFIRMED', 'تم تأكيد الطلب')}</div><h1 style={{ fontSize: 46 }}>{t(lang, 'Your gift is on its way.', 'توّا وتوصلك الهدية.')}</h1><p className="muted">{t(lang, 'Mock order', 'رقم الطلب التجريبي')} <strong>{orderId}</strong>. {t(lang, 'In a real order, we’d send delivery updates and tracking details. For now, consider it handled.', 'في الطلب الحقيقي سنرسل تحديثات التوصيل ورابط التتبع. الآن اعتبر الأمر منتهياً.')}</p><Link className="button" href="/">{t(lang, 'Back to Tawwa', 'العودة إلى توّا')}</Link></main>;
  if (!enriched.length) return <main className="container"><div className="empty-state"><GiftMark className="brand-mark empty-state-mark" /><div className="eyebrow">{t(lang, 'YOUR CART', 'سلتك')}</div><h1 style={{ fontSize: 42 }}>{t(lang, 'A lovely gift goes here.', 'هديتك الجميلة تبدأ من هنا.')}</h1><p className="muted">{t(lang, 'Your cart is taking a little breather. Let’s find someone a lovely surprise.', 'سلتك فارغة الآن. لنجد مفاجأة جميلة لشخص تحبه.')}</p><Link className="button" href="/occasions">{t(lang, 'Browse the boxes', 'تصفح الهدايا')}</Link></div></main>;
  return <><PageIntro eyebrow={t(lang, 'THE GOOD PART', 'الجزء الجميل')} title={t(lang, checkout ? 'A few details, then we’re off.' : 'Your thoughtful picks.', checkout ? 'بعض التفاصيل، ثم ننطلق.' : 'اختياراتك الجميلة.')} description={t(lang, checkout ? 'This is a demo checkout. No payment details or money are collected.' : 'A small note: this demo doesn’t collect payments.', checkout ? 'هذه تجربة إتمام طلب توضيحية. لا نطلب بيانات دفع ولا نستلم أموالاً.' : 'ملاحظة: هذا المتجر التجريبي لا يستقبل أي مدفوعات.')} />
  <main className="container section"><div className="checkout-grid"><section className="panel">
    {!checkout ? <><h2 style={{ fontSize: 27 }}>{t(lang, 'In your bag', 'في سلتك')}</h2>{enriched.map(({ product, quantity, message, date }) => <div className="cart-row" key={product!.id}><div className="cart-row-art"><MiniGift /></div><div><h3>{t(lang, product!.name, product!.ar)}</h3><div className="muted">{fmt(product!.price)}{date ? ` · ${date}` : ''}{message ? ` · ${t(lang, 'Card added', 'تمت إضافة البطاقة')}` : ''}</div><div className="qty"><button onClick={() => updateQty(product!.id, -1)} aria-label="Decrease quantity"><Minus size={16} /></button><span>{quantity}</span><button onClick={() => updateQty(product!.id, 1)} aria-label="Increase quantity"><Plus size={16} /></button><button className="remove" onClick={() => removeItem(product!.id)}>{t(lang, 'Remove', 'إزالة')}</button></div></div><div className="price">{fmt(product!.price * quantity)}</div></div>)}<div className="summary-line total"><span>{t(lang, 'Subtotal', 'المجموع')}</span><span>{fmt(subtotal)}</span></div><div className="summary-line muted"><span>{t(lang, 'Delivery', 'التوصيل')}</span><span>{t(lang, 'Calculated for your area', 'يحدد حسب المنطقة')}</span></div><button className="button" style={{ width: '100%', marginTop: 18 }} onClick={() => setCheckout(true)}>{t(lang, 'Continue to demo checkout', 'تابع لإتمام الطلب التجريبي')} <ArrowRight size={18} /></button></> :
      <form onSubmit={checkoutSubmit} noValidate><h2 style={{ fontSize: 27 }}>{t(lang, 'Where should it land?', 'إلى أين نرسلها؟')}</h2>{error && <p role="alert" className="field-error">{error}</p>}<div className="field"><label htmlFor="checkout-name">{t(lang, 'Your name', 'الاسم')} *</label><input id="checkout-name" name="name" required minLength={2} autoComplete="name" /></div><div className="field"><label htmlFor="checkout-phone">{t(lang, 'Mobile number', 'رقم الهاتف')} *</label><input id="checkout-phone" name="phone" required type="tel" pattern="[+0-9 -]{8,16}" autoComplete="tel" placeholder="+965 5XXX XXXX" /></div><div className="field"><label htmlFor="checkout-area">{t(lang, 'Governorate', 'المحافظة')} *</label><select id="checkout-area" name="area" required defaultValue=""><option value="" disabled>{t(lang, 'Choose an area', 'اختر المحافظة')}</option>{catalog.governorates.map(area => <option key={area}>{area}</option>)}</select></div><div className="field"><label htmlFor="checkout-address">{t(lang, 'Area / block / street', 'المنطقة / القطعة / الشارع')} *</label><input id="checkout-address" name="address" required autoComplete="street-address" /></div><div className="field"><label htmlFor="checkout-recipient">{t(lang, 'Recipient name (if different)', 'اسم المستلم (إن اختلف)')}</label><input id="checkout-recipient" name="recipient" /></div><button className="button" type="submit">{t(lang, 'Confirm demo order', 'تأكيد الطلب التجريبي')} <Check size={18} /></button><button className="remove" type="button" onClick={() => setCheckout(false)}>{t(lang, 'Back to cart', 'العودة للسلة')}</button><p className="muted" style={{ fontSize: 14, marginTop: 14 }}>{t(lang, 'Demo only. No card details, payment, or backend are connected.', 'تجربة فقط. لا توجد بيانات بطاقة أو دفع أو خادم متصل.')}</p></form>}
  </section><aside className="panel"><h3>{t(lang, 'A little reassurance', 'لراحة بالك')}</h3><p className="detail-benefit"><Check size={18} />{t(lang, 'Order by 3 PM for delivery tonight', 'اطلب قبل ٣ مساءً للتوصيل الليلة')}</p><p className="detail-benefit"><Check size={18} />{t(lang, 'Delivery to all six Kuwait governorates', 'توصيل إلى محافظات الكويت الست')}</p><p className="detail-benefit"><Check size={18} />{t(lang, 'Satisfaction promise: we’ll make it right', 'وعد الرضا: سنعالج أي مشكلة')}</p><div className="summary-line total"><span>{t(lang, 'Order total', 'إجمالي الطلب')}</span><span>{fmt(subtotal)}</span></div></aside></div></main></>;
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
  const [cart, setCart] = useState<CartItem[]>(() => { try { return JSON.parse(localStorage.getItem('tawwa-cart') || '[]') as CartItem[]; } catch { return []; } });
  const [message, setMessage] = useState('');
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('tawwa-lang', lang); }, [lang]);
  useEffect(() => { localStorage.setItem('tawwa-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { const sync = () => { try { setCart(JSON.parse(localStorage.getItem('tawwa-cart') || '[]') as CartItem[]); } catch { setCart([]); } }; window.addEventListener('tawwa-cart-update', sync); return () => window.removeEventListener('tawwa-cart-update', sync); }, []);
  useEffect(() => { if (!message) return; const id = window.setTimeout(() => setMessage(''), 3000); return () => window.clearTimeout(id); }, [message]);
  const store = useMemo<StoreValue>(() => ({
    lang, setLang,
    cart,
    addItem: (productId, messageText, date) => setCart(old => { const existing = old.find(i => i.productId === productId); return existing ? old.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1, message: messageText || i.message, date: date || i.date } : i) : [...old, { productId, quantity: 1, message: messageText, date }]; }),
    updateQty: (id, delta) => setCart(old => old.map(i => i.productId === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0)),
    removeItem: id => setCart(old => old.filter(i => i.productId !== id)),
    toast: setMessage
  }), [lang, cart]);
  return <Store.Provider value={store}><div className="app-shell"><Header /><RoutedErrorBoundary><Switch>
    <Route path="/" component={Home} /><Route path="/occasions" component={Shop} /><Route path="/product/:id" component={ProductPage} /><Route path="/gift-finder" component={GiftFinder} /><Route path="/cart" component={Cart} /><Route path="/faq" component={FAQ} /><Route path="/contact" component={Contact} /><Route component={NotFound} />
  </Switch></RoutedErrorBoundary><Footer /><Intro />{message && <div className="toast-message" role="status">{message}</div>}</div></Store.Provider>;
}
const queryClient = new QueryClient();
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><InnerApp /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
