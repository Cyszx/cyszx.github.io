const REPOS = [
  { owner: 'Cyszx', repo: 'AGMacro.github.io', versionEl: 'macroVersion', downloadsEl: 'macroDownloads', buttonEl: 'macroButton' },
  { owner: 'Cyszx', repo: 'AnimeLastStand',    versionEl: 'alsVersion',   downloadsEl: 'alsDownloads',   buttonEl: 'alsButton'   },
];

async function fetchRepoInfo({ owner, repo, versionEl, downloadsEl, buttonEl }) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const releases = await res.json();
    if (!releases.length) throw new Error('No releases');

    const latest    = releases[0];
    const latestZip = latest.assets?.find(a => a.name.endsWith('.zip'));

    document.getElementById(versionEl).textContent = latest.tag_name || 'Latest';

    if (latestZip && buttonEl) {
      const btn = document.getElementById(buttonEl);
      if (btn) btn.onclick = () => { window.location.href = latestZip.browser_download_url; };
    }

    const allTime = releases.reduce((total, rel) =>
      total + (rel.assets || []).reduce((s, a) => s + a.download_count, 0), 0);

    const dlEl = document.getElementById(downloadsEl);
    if (dlEl) dlEl.textContent = allTime.toLocaleString();

    return allTime;
  } catch (err) {
    console.error(`[${repo}]`, err);
    const vEl = document.getElementById(versionEl);
    const dEl = document.getElementById(downloadsEl);
    if (vEl) vEl.textContent = 'Error';
    if (dEl) dEl.textContent = '—';
    return 0;
  }
}

async function fetchAllRepoInfo() {
  const counts     = await Promise.all(REPOS.map(fetchRepoInfo));
  const grandTotal = counts.reduce((s, n) => s + n, 0);
  const el = document.getElementById('totalDownloads');
  if (el && grandTotal > 0) animateCount(el, 0, grandTotal, 1800);
}

function animateCount(el, from, to, duration) {
  const start = performance.now();
  function tick(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.floor(from + (to - from) * ease).toLocaleString() + '+';
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (window.scrollY / max * 100) + '%';
  }, { passive: true });
}

function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  document.querySelectorAll('.nav-link[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeMobileMenu();
    });
  });

  const logo = document.querySelector('.nav-logo');
  logo?.addEventListener('click', e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initActiveNav() {
  const links    = document.querySelectorAll('.nav-link[data-section]');
  const sections = document.querySelectorAll('.page-section[id]');

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const match = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
        if (match) match.classList.add('active');
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(s => obs.observe(s));
}

function initMobileNav() {
  const toggle   = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  if (!toggle || !navLinks) return;
  toggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    toggle.querySelector('i').className = open ? 'fas fa-times' : 'fas fa-bars';
  });
}

function closeMobileMenu() {
  const navLinks = document.getElementById('navLinks');
  const toggle   = document.getElementById('mobileToggle');
  navLinks?.classList.remove('open');
  if (toggle) toggle.querySelector('i').className = 'fas fa-bars';
}

function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 500), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initDownloadButtons() {
  document.querySelectorAll('.btn-cyan, .btn-pink').forEach(btn => {
    if (btn.tagName !== 'BUTTON') return;
    btn.addEventListener('click', () => {
      const textEl = btn.querySelector('.btn-text');
      const iconEl = btn.querySelector('i');
      if (!textEl) return;
      const origText = textEl.textContent;
      const origIcon = iconEl ? iconEl.className : '';
      textEl.textContent = 'Done!';
      if (iconEl) iconEl.className = 'fas fa-check';
      btn.disabled = true;
      setTimeout(() => {
        textEl.textContent = origText;
        if (iconEl) iconEl.className = origIcon;
        btn.disabled = false;
      }, 2000);
    });
  });
}

function initSetupTabs() {
  const tabs   = document.querySelectorAll('.setup-tab');
  const panels = document.querySelectorAll('.setup-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.setup + '-setup');
      if (panel) panel.classList.add('active');
    });
  });
}

function initDonateModal() {
  const btn      = document.getElementById('donateBtn');
  const modal    = document.getElementById('donateModal');
  const closeBtn = document.getElementById('modalClose');
  const backdrop = document.getElementById('modalBackdrop');

  const open  = () => { modal.classList.add('active');    document.body.style.overflow = 'hidden'; };
  const close = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };

  btn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function initReveal() {
  document.querySelectorAll('.macro-card, .step-card, .faq-card, .section-header').forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = (i % 5) * 0.06 + 's';
  });
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); obs.unobserve(entry.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function initParticles() {
  const wrap = document.querySelector('.bg-wrap');
  if (!wrap) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'bg-particle';
    p.style.setProperty('--x',     Math.random() * 100 + 'vw');
    p.style.setProperty('--dur',   9 + Math.random() * 13 + 's');
    p.style.setProperty('--delay', -Math.random() * 22 + 's');
    p.style.setProperty('--sz',    1.5 + Math.random() * 2.5 + 'px');
    p.style.setProperty('--op',    String(0.25 + Math.random() * 0.45));
    p.style.background = Math.random() > 0.5 ? 'var(--cyan)' : 'var(--pink)';
    wrap.appendChild(p);
  }
}

function initHeroEntrance() {
  const els = ['.hero-title', '.hero-stats', '.hero-cta'].map(s => document.querySelector(s)).filter(Boolean);
  els.forEach((el, i) => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = `opacity 0.55s ease ${i * 0.1}s, transform 0.55s ease ${i * 0.1}s`;
  });
  requestAnimationFrame(() => {
    els.forEach(el => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  });
}

function initHeroParallax() {
  const content = document.querySelector('.hero-content');
  if (!content) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          content.style.transform = `translateY(${y * 0.18}px)`;
          content.style.opacity   = String(1 - y / 650);
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

fetchAllRepoInfo();

document.addEventListener('DOMContentLoaded', () => {
  initScrollProgress();
  initNavbar();
  initActiveNav();
  initMobileNav();
  initBackToTop();
  initDownloadButtons();
  initSetupTabs();
  initDonateModal();
  initReveal();
  initParticles();
  initHeroParallax();
  initHeroEntrance();
});