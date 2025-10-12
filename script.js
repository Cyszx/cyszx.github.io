  document.addEventListener('DOMContentLoaded', function() {
      fetchMacroInfo();
      fetchAnimeInfo();
      fetchAnimeLastStandInfo();
      
      const downloadsBtn = document.getElementById('downloadsTabButton');
      const setupBtn = document.getElementById('setupTabButton');
      const faqBtn = document.getElementById('faqTabButton');
      
      downloadsBtn.addEventListener('click', function() {
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById('downloadsTab').classList.add('active');
        downloadsBtn.classList.add('active');
        setupBtn.classList.remove('active');
        faqBtn.classList.remove('active');
      });
      
      setupBtn.addEventListener('click', function() {
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById('setupTab').classList.add('active');
        setupBtn.classList.add('active');
        downloadsBtn.classList.remove('active');
        faqBtn.classList.remove('active');
      });
      
      faqBtn.addEventListener('click', function() {
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById('faqTab').classList.add('active');
        faqBtn.classList.add('active');
        downloadsBtn.classList.remove('active');
        setupBtn.classList.remove('active');
      });
      
      const donationButton = document.getElementById('donationButton');
      const donationMenu = document.getElementById('donationMenu');
      
      donationButton.addEventListener('click', function() {
        donationMenu.classList.toggle('active');
      });
      
      document.addEventListener('click', function(e) {
        if (!donationButton.contains(e.target) && !donationMenu.contains(e.target)) {
          donationMenu.classList.remove('active');
        }
      });
      
      const smallDonation = document.getElementById('smallDonation');
      const midDonation = document.getElementById('midDonation');
      const bigDonation = document.getElementById('bigDonation');
      const astdxDonation = document.getElementById('astdxDonation');
      
      smallDonation.addEventListener('click', function() {
        createConfetti(30);
      });
      
      midDonation.addEventListener('click', function() {
        createConfetti(60);
      });
      
      bigDonation.addEventListener('click', function() {
        createConfetti(100);
      });
      
      astdxDonation.addEventListener('click', function() {
        createConfetti(50);
      });
      
      const generalSetupButton = document.getElementById('generalSetupButton');
      const agSetupButton = document.getElementById('agSetupButton');
      const alsSetupButton = document.getElementById('alsSetupButton');
      
      const generalSetupTab = document.getElementById('generalSetupTab');
      const agSetupTab = document.getElementById('agSetupTab');
      const alsSetupTab = document.getElementById('alsSetupTab');
      
      generalSetupButton.addEventListener('click', function() {
        document.querySelectorAll('.game-tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.querySelectorAll('.game-tab-button').forEach(button => {
          button.classList.remove('active');
        });
        generalSetupTab.classList.add('active');
        generalSetupButton.classList.add('active');
      });
      
      agSetupButton.addEventListener('click', function() {
        document.querySelectorAll('.game-tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.querySelectorAll('.game-tab-button').forEach(button => {
          button.classList.remove('active');
        });
        agSetupTab.classList.add('active');
        agSetupButton.classList.add('active');
      });
      
      alsSetupButton.addEventListener('click', function() {
        document.querySelectorAll('.game-tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.querySelectorAll('.game-tab-button').forEach(button => {
          button.classList.remove('active');
        });
        alsSetupTab.classList.add('active');
        alsSetupButton.classList.add('active');
      });
    });

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
        downloadButton.href = zipAsset.browser_download_url;
        downloadButton.addEventListener('click', function() {
          updateDownloadUI('macro');
        });
      } catch (error) {
        document.getElementById('macroVersion').textContent = "Error";
        document.getElementById('macroDownloads').textContent = "0";
        updateButtonStatus('macroButton', false);
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
        downloadButton.href = zipAsset.browser_download_url;
        downloadButton.addEventListener('click', function() {
          updateDownloadUI('anime');
        });
      } catch (error) {
        document.getElementById('animeVersion').textContent = "Error";
        document.getElementById('animeDownloads').textContent = "0";
        updateButtonStatus('animeButton', false);
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
        downloadButton.href = zipAsset.browser_download_url;
        downloadButton.addEventListener('click', function() {
          updateDownloadUI('als');
        });
      } catch (error) {
        document.getElementById('alsVersion').textContent = "Error";
        document.getElementById('alsDownloads').textContent = "0";
        updateButtonStatus('alsButton', false);
      }
    }

    function updateButtonStatus(buttonId, available) {
      if (!available) {
        const button = document.getElementById(buttonId);
        const parentElement = button.parentElement;
        const notAvailableDiv = document.createElement('div');
        notAvailableDiv.className = 'not-available';
        notAvailableDiv.innerHTML = '<i class="fas fa-info-circle"></i> Download currently unavailable';
        parentElement.replaceChild(notAvailableDiv, button);
      }
    }

    function updateDownloadUI(type) {
      const button = document.getElementById(type + 'Button');
      button.innerHTML = '<i class="fas fa-check"></i> Download Started!';
      button.style.background = 'linear-gradient(135deg, var(--success-color), var(--primary-color))';
      
      setTimeout(() => {
        button.innerHTML = '<i class="fas fa-download"></i> Download Now';
        button.style.background = 'linear-gradient(135deg, var(--primary-color), var(--primary-dark))';
      }, 2000);
    }
    
    function createConfetti(count) {
      for (let i = 0; i < count; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        const size = Math.random() * 10 + 5;
        confetti.style.width = `${size}px`;
        confetti.style.height = `${size}px`;
        
        const colors = ['#ff9500', '#ffcc00', '#ff2d55', '#5856d6', '#007aff'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = randomColor;
        
        const left = Math.random() * 100;
        confetti.style.left = `${left}%`;
        
        const delay = Math.random() * 2;
        confetti.style.animationDelay = `${delay}s`;
        
        const duration = Math.random() * 2 + 1;
        confetti.style.animationDuration = `${duration}s`;
        
        document.body.appendChild(confetti);
        
        setTimeout(() => {
          confetti.remove();
        }, duration * 1000);
      }
    }