// Public marketing landing page shown at "/" to logged-out visitors.
// Explains what Bilkul does, offers app downloads for creators, routes sellers
// to contact the admin, and lists the agency services.

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.aaina.creator";
const APPSTORE_URL = "https://apps.apple.com/app/id6807625968";
const WHATSAPP = "https://wa.me/917974311721";
const EMAIL = "support@thebilkul.in";

// Platforms we manage. Names/colours are used as branded chips (nominative use).
const ECOM_PLATFORMS = [
  { name: "Amazon", bg: "#FF9900", fg: "#0f172a" },
  { name: "Flipkart", bg: "#2874F0", fg: "#ffffff" },
  { name: "Meesho", bg: "#F43397", fg: "#ffffff" },
  { name: "Myntra", bg: "#FF3F6C", fg: "#ffffff" },
  { name: "Nykaa", bg: "#FC2779", fg: "#ffffff" },
  { name: "Ajio", bg: "#2d2d2d", fg: "#ffffff" },
];
const QCOM_PLATFORMS = [
  { name: "Blinkit", bg: "#F8CB46", fg: "#0f172a" },
  { name: "Zepto", bg: "#5A31F4", fg: "#ffffff" },
  { name: "Swiggy Instamart", bg: "#FC8019", fg: "#ffffff" },
  { name: "BigBasket", bg: "#84C225", fg: "#ffffff" },
  { name: "JioMart", bg: "#0078AD", fg: "#ffffff" },
];

// A logo tile: shows /logos/<slug>.png if present, else a clean neutral wordmark.
function LogoTile({ name }: { name: string }) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex h-16 items-center justify-center rounded-xl border border-slate-100 bg-white px-4 shadow-sm transition hover:shadow-md">
      <img
        src={`/logos/${slug}.png`}
        alt={name}
        className="max-h-8 max-w-[85%] object-contain grayscale opacity-80 transition hover:grayscale-0 hover:opacity-100"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = "none";
          const fallback = img.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "inline";
        }}
      />
      <span className="hidden text-base font-bold tracking-tight text-slate-600">
        {name}
      </span>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">
        B
      </div>
      <span className="text-lg font-black tracking-tight text-ink">Bilkul</span>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Brand />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <a href="#about" className="hover:text-primary">About</a>
            <a href="#creators" className="hover:text-primary">For Creators</a>
            <a href="#sellers" className="hover:text-primary">For Brands</a>
            <a href="#services" className="hover:text-primary">Services</a>
            <a href="#contact" className="hover:text-primary">Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-50 to-white">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <span className="inline-block rounded-full bg-primary-100 px-4 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            Creator × Brand Marketplace
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-tight text-ink md:text-6xl">
            Test products. Share honest reviews. Get rewarded.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500">
            Bilkul connects content creators with brands. Creators earn cash, free
            products, and cashback for authentic reviews — and brands get real content from real people.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-bold text-white hover:opacity-90"
            >
              ▶ Get it on Google Play
            </a>
            <a
              href={APPSTORE_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-bold text-white hover:opacity-90"
            >
               Download on the App Store
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-400">Free to join for creators.</p>
        </div>
      </section>

      {/* About Us */}
      <section id="about" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-primary">About Us</span>
            <h2 className="mt-3 text-3xl font-black text-ink">Real creators. Honest reviews. Real growth.</h2>
            <p className="mt-4 text-slate-500">
              Bilkul is a creator–brand marketplace and digital-commerce agency. We believe the best
              marketing comes from genuine people sharing genuine experiences — not ads. So we connect
              everyday content creators with brands who want authentic reviews of their products.
            </p>
            <p className="mt-4 text-slate-500">
              Creators discover campaigns, test or receive products, and share honest reviews to earn cash,
              free products, cashback, and referral rewards. Brands get trustworthy,
              creator-made content at scale — plus optional hands-on management of their online stores
              through our agency services.
            </p>
            <p className="mt-4 text-slate-500">
              Our mission is simple: make authentic creator marketing accessible to everyone, and help small
              and growing brands compete with honest, people-first content.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { n: "Creators", d: "Earn from honest reviews" },
              { n: "Brands", d: "Authentic content at scale" },
              { n: "Cashback", d: "Free products + rewards" },
              { n: "Agency", d: "E-com & quick-com managed" },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-100 bg-primary-50 p-6 text-center">
                <p className="text-lg font-black text-primary">{s.n}</p>
                <p className="mt-1 text-xs text-slate-500">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Creators */}
      <section id="creators" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center text-3xl font-black text-ink">For Creators</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-500">
          Turn your Instagram into rewards. Connect your account for verified followers and insights.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { t: "Browse & apply", d: "Discover campaigns from brands, and apply to the ones you love." },
            { t: "Test & review", d: "Receive or buy the product, try it, and share your honest review with photos and video." },
            { t: "Get rewarded", d: "Earn cash, free products, cashback, and referral bonuses once your review is approved." },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-ink">{c.t}</h3>
              <p className="mt-2 text-sm text-slate-500">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For Sellers */}
      <section id="sellers" className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="text-3xl font-black text-ink">For Brands</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">
            Run barter, paid, and reimbursement campaigns with vetted creators, and get authentic content
            at scale. Onboarding is handled personally by our team.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary-600"
            >
              Contact us on WhatsApp
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:border-primary hover:text-primary"
            >
              Email {EMAIL}
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Already a brand? <a href="/login" className="font-semibold text-primary">Log in to your dashboard</a>.
          </p>
        </div>
      </section>

      {/* Agency Services */}
      <section id="services" className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center text-3xl font-black text-ink">Our Agency Services</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-500">
            Beyond the marketplace, we manage your online business end to end — from listings and ads to
            creator-led reviews — across every major e-commerce and quick-commerce platform in India.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-xl">🛒</div>
              <h3 className="text-xl font-bold text-ink">E-com Manager</h3>
              <p className="mt-2 text-sm text-slate-500">
                Full management of your e-commerce presence so you can focus on your product while we grow sales.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>• Account setup, cataloging &amp; optimized listings</li>
                <li>• A+ content, images &amp; SEO-rich descriptions</li>
                <li>• Ads &amp; sponsored campaigns management</li>
                <li>• Creator-led reviews &amp; ratings boost</li>
                <li>• Inventory, pricing &amp; performance reporting</li>
              </ul>
              <p className="mt-5 text-xs font-semibold text-slate-400">
                Amazon · Flipkart · Meesho · Myntra · Nykaa · Ajio
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-xl">⚡</div>
              <h3 className="text-xl font-bold text-ink">Quick-Commerce Manager</h3>
              <p className="mt-2 text-sm text-slate-500">
                Get your products onto 10-minute delivery apps and win the fast-growing quick-commerce shelf.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>• Platform onboarding &amp; brand registration</li>
                <li>• Listings, catalog &amp; content setup</li>
                <li>• Promotions, offers &amp; visibility placements</li>
                <li>• Creator-led local awareness campaigns</li>
                <li>• Demand &amp; availability tracking</li>
              </ul>
              <p className="mt-5 text-xs font-semibold text-slate-400">
                Blinkit · Zepto · Swiggy Instamart · BigBasket · JioMart
              </p>
            </div>
          </div>

          {/* Platforms / logo wall */}
          <div className="mt-14 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Platforms &amp; brands we work with</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
              From large marketplace brands to small business owners going online for the first time.
            </p>
            <div className="mx-auto mt-6 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {[...ECOM_PLATFORMS, ...QCOM_PLATFORMS].map((p) => (
                <LogoTile key={p.name} name={p.name} />
              ))}
            </div>
          </div>

          <div className="mt-12 text-center">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary-600"
            >
              Talk to us about services
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="text-center text-3xl font-black text-ink">Frequently Asked Questions</h2>
        <div className="mt-10 space-y-4">
          {[
            {
              q: "How do creators earn on Bilkul?",
              a: "Download the app, apply to campaigns, receive or buy the product, and share an honest review. Once approved, you earn cash, free products, cashback, and referral bonuses.",
            },
            {
              q: "Is it free for creators to join?",
              a: "Yes. Joining and applying to campaigns is completely free for creators.",
            },
            {
              q: "How do brands get started?",
              a: "Brands don't self-register — our team onboards you personally. Just contact us on WhatsApp or email and we'll set up your account and first campaign.",
            },
            {
              q: "Which platforms do you manage for brands?",
              a: "E-commerce like Amazon, Flipkart, Meesho, Myntra, Nykaa and Ajio, plus quick-commerce like Blinkit, Zepto, Swiggy Instamart, BigBasket and JioMart.",
            },
            {
              q: "Do I need a Facebook account to connect Instagram?",
              a: "No. Creators connect Instagram directly — no Facebook required — to show verified followers and insights.",
            },
          ].map((f) => (
            <div key={f.q} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-ink">{f.q}</h3>
              <p className="mt-2 text-sm text-slate-500">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Us */}
      <section id="contact" className="bg-primary-50">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="text-3xl font-black text-ink">Get in Touch</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">
            Questions, partnerships, or ready to grow your brand? We'd love to hear from you.
          </p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-primary">
              <div className="text-2xl">💬</div>
              <p className="mt-2 text-sm font-bold text-ink">WhatsApp</p>
              <p className="mt-1 text-xs text-slate-500">+91 79743 11721</p>
            </a>
            <a href={`tel:+917974311721`} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-primary">
              <div className="text-2xl">📞</div>
              <p className="mt-2 text-sm font-bold text-ink">Call Us</p>
              <p className="mt-1 text-xs text-slate-500">+91 79743 11721</p>
            </a>
            <a href={`mailto:${EMAIL}`} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-primary">
              <div className="text-2xl">✉️</div>
              <p className="mt-2 text-sm font-bold text-ink">Email</p>
              <p className="mt-1 text-xs text-slate-500">{EMAIL}</p>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 md:flex-row">
          <Brand />
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="/privacy" className="hover:text-primary">Privacy</a>
            <a href="/terms" className="hover:text-primary">Terms &amp; Conditions</a>
            <a href="/data-deletion" className="hover:text-primary">Data Deletion</a>
            <a href={`mailto:${EMAIL}`} className="hover:text-primary">{EMAIL}</a>
          </div>
          <span className="text-xs text-slate-400">
            © {new Date().getFullYear()} Bilkul
          </span>
        </div>
      </footer>
    </div>
  );
}
