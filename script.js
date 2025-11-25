function createSnowflakes() {
  const container = document.getElementById('snowContainer');
  const snowflakeCount = 50;
  
  for (let i = 0; i < snowflakeCount; i++) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.innerHTML = '❄';
    snowflake.style.left = Math.random() * 100 + '%';
    snowflake.style.animationDuration = (Math.random() * 3 + 2) + 's';
    snowflake.style.animationDelay = Math.random() * 5 + 's';
    snowflake.style.fontSize = (Math.random() * 10 + 10) + 'px';
    snowflake.style.opacity = Math.random() * 0.6 + 0.4;
    container.appendChild(snowflake);
  }
}

function createClickEffect(e) {
	const x = e.clientX;
	const y = e.clientY;
  
	for (let i = 0; i < 8; i++) {
		const sparkle = document.createElement('img');
		sparkle.src = './assets/click.png';
		sparkle.style.position = 'fixed';
		sparkle.style.width = '20px';
		sparkle.style.height = '20px';
		sparkle.style.pointerEvents = 'none';
		sparkle.style.zIndex = '9999';

		const angle = (Math.PI * 2 * i) / 8;
		const radius = 10 + Math.random() * 15;
		const startX = x + Math.cos(angle) * radius;
		const startY = y + Math.sin(angle) * radius;

		sparkle.style.left = startX + 'px';
		sparkle.style.top = startY + 'px';
  
		document.body.appendChild(sparkle);
    
		let posX = 0;
		let posY = 0;
		let opacity = 1;

		const velocity = 40 + Math.random() * 40;
		const vx = Math.cos(angle) * velocity;
		const vy = Math.sin(angle) * velocity;
    
		const animate = () => {
			posX += vx * 0.02;
			posY += vy * 0.02;
			opacity -= 0.02;
      
			sparkle.style.transform = `translate(${posX}px, ${posY}px)`;
			sparkle.style.opacity = opacity;
      
			if (opacity > 0) {
				requestAnimationFrame(animate);
			} else {
				sparkle.remove();
			}
		};
    
		animate();
	}
  
  const ripple = document.createElement('div');
  ripple.style.position = 'fixed';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.style.width = '20px';
  ripple.style.height = '20px';
  ripple.style.borderRadius = '50%';
  ripple.style.border = '2px solid #ffd700';
  ripple.style.transform = 'translate(-50%, -50%)';
  ripple.style.pointerEvents = 'none';
  ripple.style.zIndex = '9999';
  ripple.style.animation = 'rippleEffect 0.6s ease-out';
  
  document.body.appendChild(ripple);
  
  setTimeout(() => ripple.remove(), 600);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes rippleEffect {
    0% {
      width: 20px;
      height: 20px;
      opacity: 1;
    }
    100% {
      width: 100px;
      height: 100px;
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link[data-tab]');
  const sections = document.querySelectorAll('.content-section');
  
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      createClickEffect(e);
      
      const targetTab = link.dataset.tab;
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === targetTab + '-section') {
          section.classList.add('active');
        }
      });
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function initSetupTabs() {
  const setupTabs = document.querySelectorAll('.setup-tab');
  const setupPanels = document.querySelectorAll('.setup-panel');
  
  setupTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      createClickEffect(e);
      
      const targetSetup = tab.dataset.setup;
      
      setupTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      setupPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === targetSetup + '-setup') {
          panel.classList.add('active');
        }
      });
    });
  });
}

function initDownloadButtons() {
  const downloadButtons = document.querySelectorAll('.btn-download, .btn-premium');
  
  downloadButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      createClickEffect(e);
      
      button.classList.add('clicked');
      
      const originalText = button.querySelector('.btn-text').textContent;
      const originalIcon = button.querySelector('i').className;
      
      button.querySelector('.btn-text').textContent = 'Success!';
      button.querySelector('i').className = 'fas fa-check';
      
      setTimeout(() => {
        button.classList.remove('clicked');
        button.querySelector('.btn-text').textContent = originalText;
        button.querySelector('i').className = originalIcon;
      }, 2000);
    });
  });
}

function initCardEffects() {
  const cards = document.querySelectorAll('.macro-card');
  
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px)`;
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

function initDonateModal() {
  const donateBtn = document.getElementById('donateBtn');
  const donateModal = document.getElementById('donateModal');
  const modalClose = document.getElementById('modalClose');
  const modalBackdrop = document.getElementById('modalBackdrop');
  
  donateBtn.addEventListener('click', (e) => {
    createClickEffect(e);
    donateModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
  
  modalClose.addEventListener('click', (e) => {
    createClickEffect(e);
    donateModal.classList.remove('active');
    document.body.style.overflow = '';
  });
  
  modalBackdrop.addEventListener('click', () => {
    donateModal.classList.remove('active');
    document.body.style.overflow = '';
  });
  
  const donateOptions = document.querySelectorAll('.donate-option');
  donateOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      createClickEffect(e);
    });
  });
}

async function fetchMacroInfo() {
  try {
    const response = await fetch('https://api.github.com/repos/Cyszx/AGMacro.github.io/releases/latest');
    if (!response.ok) throw new Error('Failed to fetch');
    
    const data = await response.json();
    if (!data.assets || data.assets.length === 0) throw new Error('No assets found');
    
    const zipAsset = data.assets.find(asset => asset.name.endsWith('.zip'));
    if (!zipAsset) throw new Error('No ZIP asset found');
    
    document.getElementById('macroVersion').textContent = data.tag_name || 'Latest';
    document.getElementById('macroDownloads').textContent = zipAsset.download_count.toLocaleString();
    
    const downloadButton = document.getElementById('macroButton');
    downloadButton.onclick = () => {
      window.location.href = zipAsset.browser_download_url;
    };
    
    updateTotalDownloads(zipAsset.download_count);
  } catch (error) {
    console.error('Error fetching macro info:', error);
    document.getElementById('macroVersion').textContent = "Error";
    document.getElementById('macroDownloads').textContent = "0";
  }
}

async function fetchAnimeInfo() {
  try {
    const response = await fetch('https://api.github.com/repos/Cyszx/Anime-Royale-Macro/releases/latest');
    if (!response.ok) throw new Error('Failed to fetch');
    
    const data = await response.json();
    if (!data.assets || data.assets.length === 0) throw new Error('No assets found');
    
    const zipAsset = data.assets.find(asset => asset.name.endsWith('.zip'));
    if (!zipAsset) throw new Error('No ZIP asset found');
    
    document.getElementById('animeVersion').textContent = data.tag_name || 'Latest';
    document.getElementById('animeDownloads').textContent = zipAsset.download_count.toLocaleString();
    
    const downloadButton = document.getElementById('animeButton');
    downloadButton.onclick = () => {
      window.location.href = zipAsset.browser_download_url;
    };
    
    updateTotalDownloads(zipAsset.download_count);
  } catch (error) {
    console.error('Error fetching anime info:', error);
    document.getElementById('animeVersion').textContent = "Error";
    document.getElementById('animeDownloads').textContent = "0";
  }
}

async function fetchAnimeLastStandInfo() {
  try {
    const response = await fetch('https://api.github.com/repos/Cyszx/AnimeLastStand/releases/latest');
    if (!response.ok) throw new Error('Failed to fetch');
    
    const data = await response.json();
    if (!data.assets || data.assets.length === 0) throw new Error('No assets found');
    
    const zipAsset = data.assets.find(asset => asset.name.endsWith('.zip'));
    if (!zipAsset) throw new Error('No ZIP asset found');
    
    document.getElementById('alsVersion').textContent = data.tag_name || 'Latest';
    document.getElementById('alsDownloads').textContent = zipAsset.download_count.toLocaleString();
    
    const downloadButton = document.getElementById('alsButton');
    downloadButton.onclick = () => {
      window.location.href = zipAsset.browser_download_url;
    };
    
    updateTotalDownloads(zipAsset.download_count);
  } catch (error) {
    console.error('Error fetching ALS info:', error);
    document.getElementById('alsVersion').textContent = "Error";
    document.getElementById('alsDownloads').textContent = "0";
  }
}

let totalDownloadsCount = 0;
function updateTotalDownloads(count) {
  totalDownloadsCount += count;
  const totalElement = document.getElementById('totalDownloads');
  if (totalElement) {
    animateValue(totalElement, 0, totalDownloadsCount, 2000);
  }
}

function animateValue(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = Math.floor(current).toLocaleString() + '+';
  }, 16);
}

function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, {
    threshold: 0.1
  });
  
  const animatedElements = document.querySelectorAll('.macro-card, .step-card, .faq-card');
  animatedElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

function initButtonParticles() {
  const buttons = document.querySelectorAll('.btn-download, .btn-premium');
  
  buttons.forEach(button => {
    button.addEventListener('mouseenter', (e) => {
      const rect = button.getBoundingClientRect();
      
      for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.left = rect.left + Math.random() * rect.width + 'px';
        particle.style.top = rect.top + Math.random() * rect.height + 'px';
        particle.style.width = '4px';
        particle.style.height = '4px';
        particle.style.borderRadius = '50%';
        particle.style.background = '#ffd700';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '999';
        particle.style.opacity = '1';
        
        document.body.appendChild(particle);
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 20 + Math.random() * 20;
        let posX = 0;
        let posY = 0;
        let opacity = 1;
        
        const animate = () => {
          posX += Math.cos(angle) * velocity * 0.05;
          posY += Math.sin(angle) * velocity * 0.05;
          opacity -= 0.02;
          
          particle.style.transform = `translate(${posX}px, ${posY}px)`;
          particle.style.opacity = opacity;
          
          if (opacity > 0) {
            requestAnimationFrame(animate);
          } else {
            particle.remove();
          }
        };
        
        setTimeout(() => animate(), i * 50);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  createSnowflakes();
  initNavigation();
  initSetupTabs();
  initDownloadButtons();
  initCardEffects();
  initDonateModal();
  initScrollAnimations();
  initButtonParticles();
  
  fetchMacroInfo();
  fetchAnimeInfo();
  fetchAnimeLastStandInfo();
  
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, a, .nav-link, .setup-tab')) {
      return;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-link')) {
      window.scrollTo(0, 700)
      return;
    }
  });
  
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
  
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector('.hero-content');
    if (hero) {
      hero.style.transform = `translateY(${scrolled * 0.3}px)`;
      hero.style.opacity = 1 - (scrolled / 800);
    }
  });
  
  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle) {
    heroTitle.style.opacity = '0';
    setTimeout(() => {
      heroTitle.style.transition = 'opacity 1s ease';
      heroTitle.style.opacity = '1';
    }, 500);
  }
  
  const premiumButtons = document.querySelectorAll('.btn-premium');
  premiumButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      createConfetti(e.clientX, e.clientY);
    });
  });
});

function createConfetti(x, y) {
  const colors = ['#c41e3a', '#0f7d3d', '#ffd700'];
  
  for (let i = 0; i < 30; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.left = x + 'px';
    confetti.style.top = y + 'px';
    confetti.style.width = '10px';
    confetti.style.height = '10px';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.pointerEvents = 'none';
    confetti.style.zIndex = '9999';
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    
    document.body.appendChild(confetti);
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = 50 + Math.random() * 100;
    const gravity = 0.5;
    let vx = Math.cos(angle) * velocity;
    let vy = Math.sin(angle) * velocity;
    let posX = 0;
    let posY = 0;
    let rotation = 0;
    let opacity = 1;
    
    const animate = () => {
      posX += vx * 0.02;
      posY += vy * 0.02;
      vy += gravity;
      rotation += 5;
      opacity -= 0.01;
      
      confetti.style.transform = `translate(${posX}px, ${posY}px) rotate(${rotation}deg)`;
      confetti.style.opacity = opacity;
      
      if (opacity > 0 && posY < window.innerHeight) {
        requestAnimationFrame(animate);
      } else {
        confetti.remove();
      }
    };
    
    animate();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const modal = document.getElementById('donateModal');
    if (!modal.classList.contains('active')) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }
  
  if (e.key === 'Escape') {
    const modal = document.getElementById('donateModal');
    if (modal.classList.contains('active')) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }
});