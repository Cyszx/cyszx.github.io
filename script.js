// ==========================================
// CONFIGURATION & STATE
// ==========================================

const API_BASE = "https://cys-configs-api.cyszxz615.workers.dev";
const DISCORD_CLIENT_ID = "1363171262314188951";
function getRedirectUri() {
  if (window.location.protocol === "file:" || !window.location.origin || window.location.origin === "null") {
    return "https://cyszx.github.io/";
  }
  let uri = window.location.origin + window.location.pathname;
  uri = uri.replace(/\/index\.html$/i, "/");
  if (!uri.endsWith("/")) uri += "/";
  return uri;
}
const REDIRECT_URI = getRedirectUri();

let currentUser = null;
let allReviews = [];
let currentReviewFilter = "all";
let selectedStarRating = 5;

const STAR_LABELS = {
  1: "★☆☆☆☆ - 1 Star (Poor)",
  2: "★★☆☆☆ - 2 Stars (Fair)",
  3: "★★★☆☆ - 3 Stars (Good)",
  4: "★★★★☆ - 4 Stars (Very Good)",
  5: "★★★★★ - 5 Stars (Flawless / Excellent!)"
};

const REPOS = [
  { owner: 'Cyszx', repo: 'AGMacro.github.io', versionEl: 'macroVersion', downloadsEl: 'macroDownloads', buttonEl: 'macroButton' },
  { owner: 'Cyszx', repo: 'AnimeLastStand',    versionEl: 'alsVersion',   downloadsEl: 'alsDownloads',   buttonEl: 'alsButton'   },
  { owner: 'Cyszx', repo: 'Cys-Task',          versionEl: 'taskVersion',  downloadsEl: 'taskDownloads',  buttonEl: 'taskButton'  },
];



// ==========================================
// GITHUB REPO STATS
// ==========================================

async function fetchRepoInfo({ owner, repo, versionEl, downloadsEl, buttonEl }) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const releases = await res.json();
    if (!releases.length) throw new Error('No releases');

    const latest    = releases[0];
    const latestZip = latest.assets?.find(a => a.name.endsWith('.zip'));

    const vEl = document.getElementById(versionEl);
    if (vEl) vEl.textContent = latest.tag_name || 'Latest';

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
    console.warn(`[${repo}] GitHub API stats unavailable, using defaults.`);
    const vEl = document.getElementById(versionEl);
    const dEl = document.getElementById(downloadsEl);
    if (vEl) vEl.textContent = 'v2.1.0';
    if (dEl) dEl.textContent = '2,400+';
    return 2400;
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

// ==========================================
// AUTHENTICATION & DISCORD OAUTH
// ==========================================

function loadUserFromStorage() {
  try {
    const userData = localStorage.getItem("ch_user");
    const token = localStorage.getItem("ch_token");
    if (userData && token) {
      currentUser = JSON.parse(userData);
      currentUser.is_admin = !!currentUser.is_admin;
      currentUser.is_premium = !!(currentUser.is_premium || currentUser.is_admin || currentUser.is_config_maker || currentUser.is_creator);
      syncLiveUserRoles();
    }
  } catch (e) {
    localStorage.removeItem("ch_user");
    localStorage.removeItem("ch_token");
  }
  updateNavbarAuthUI();
}

function syncLiveUserRoles() {
  const token = localStorage.getItem("ch_token");
  if (!token) return;

  fetch(API_BASE + "/api/auth/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => {
      if (res.status === 401) {
        console.warn("[Auth Sync] Session expired or invalid.");
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data || !data.user) return;
      console.log("[Auth Sync] Live roles synced from Cloudflare:", data);
      if (currentUser) {
        currentUser.is_admin = !!data.user.is_admin;
        currentUser.is_config_maker = !!data.user.is_config_maker;
        currentUser.is_creator = !!data.user.is_creator;
        if (data.user.is_public !== undefined) {
          currentUser.is_public = !!data.user.is_public;
        }
        localStorage.setItem("ch_user", JSON.stringify(currentUser));
        updateNavbarAuthUI();
      }
      // Check Key System API on Railway
      verifyCurrentUserKeySystem();
    })
    .catch(err => {
      console.warn("[Auth Sync] Could not sync live roles:", err);
      verifyCurrentUserKeySystem();
    });
}

function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  window.history.replaceState({}, "", window.location.pathname);

  fetch(API_BASE + "/api/auth/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code, redirect_uri: REDIRECT_URI }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast("Login failed: " + data.error, "error");
        return;
      }
      currentUser = data.user;
      currentUser.is_admin = !!currentUser.is_admin;
      localStorage.setItem("ch_user", JSON.stringify(currentUser));
      localStorage.setItem("ch_token", data.token);
      updateNavbarAuthUI();
      const roleTitle = currentUser.is_admin
        ? " (Admin)"
        : ((currentUser.is_config_maker || currentUser.is_creator)
          ? " (Config Maker)"
          : (currentUser.is_premium ? " (Premium)" : ""));
      showToast("Logged in as " + currentUser.username + roleTitle, "success");
      verifyCurrentUserKeySystem();
    })
    .catch(err => {
      console.error("Auth error:", err);
      showToast("Login connection error: " + (err.message || "Network error"), "error");
    });
}

window.startDiscordLogin = function () {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read guilds",
    prompt: "consent",
  });
  window.location.href = "https://discord.com/api/oauth2/authorize?" + params.toString();
};

window.handleNavAuthClick = function () {
  if (currentUser) {
    openUserProfileModal(currentUser.id);
  } else {
    startDiscordLogin();
  }
};

window.logoutUser = function () {
  if (confirm(`Logged in as ${currentUser?.username || "User"}.\n\nDo you want to log out?`)) {
    localStorage.removeItem("ch_user");
    localStorage.removeItem("ch_token");
    currentUser = null;
    closeUserProfileModal();
    updateNavbarAuthUI();
    showToast("Logged out successfully.", "success");
  }
};

function updateNavbarAuthUI() {
  const btn = document.getElementById("navAuthBtn");
  const text = document.getElementById("navAuthText");
  const userBadgeWrap = document.getElementById("reviewUserBadgeWrap");
  if (!btn || !text) return;

  if (currentUser) {
    btn.classList.add("logged-in");
    const isOwner = currentUser.is_owner || currentUser.id === "1141849395902554202" || (currentUser.roles && currentUser.roles.some(r => /owner/i.test(r)));
    const isConfigMaker = currentUser.is_config_maker || currentUser.is_creator;
    const isPrem = isOwner || currentUser.is_premium || currentUser.is_admin || isConfigMaker;
    if (isPrem) {
      btn.classList.add("premium");
      const prefix = isOwner ? "👑 " : (currentUser.is_admin ? "⚡ " : (isConfigMaker ? "🛠️ " : "⭐ "));
      text.textContent = prefix + currentUser.username;
    } else {
      btn.classList.remove("premium");
      text.textContent = currentUser.username;
    }
    btn.title = "Click to view your Profile & Farming Stats";

    if (userBadgeWrap) {
      let chipHtml = '<span class="user-role-chip free-chip"><i class="fas fa-user"></i> Free Member</span>';
      if (isOwner) {
        chipHtml = '<span class="user-role-chip owner-chip"><i class="fas fa-crown"></i> Owner</span>';
      } else if (currentUser.is_admin) {
        chipHtml = '<span class="user-role-chip admin-chip"><i class="fas fa-bolt"></i> Admin</span>';
      } else if (isConfigMaker) {
        chipHtml = '<span class="user-role-chip config-maker-chip"><i class="fas fa-hammer"></i> Config Maker</span>';
      } else if (currentUser.is_premium) {
        chipHtml = '<span class="user-role-chip premium-chip"><i class="fas fa-star"></i> Verified Premium</span>';
      }
      userBadgeWrap.innerHTML = `
        <span style="color:var(--text-2);">Logged in as <strong>${escapeHtml(currentUser.username)}</strong></span>
        ${chipHtml}
      `;
    }
  } else {
    btn.classList.remove("logged-in", "premium");
    text.textContent = "Login";
    btn.title = "Login with Discord";
    if (userBadgeWrap) {
      userBadgeWrap.innerHTML = `
        <button class="nav-auth-btn" onclick="startDiscordLogin()" style="font-size:0.75rem;padding:0.25rem 0.75rem;">
          <i class="fab fa-discord"></i> Login to Review
        </button>
      `;
    }
  }

  const writeReviewBtn = document.getElementById("btnOpenReviewModal");
  if (writeReviewBtn) {
    const existing = allReviews.find(r => currentUser && r.user_id === currentUser.id);
    if (existing) {
      writeReviewBtn.innerHTML = '<i class="fas fa-edit"></i> <span>Edit Your Review</span>';
    } else {
      writeReviewBtn.innerHTML = '<i class="fas fa-pen"></i> <span>Write a Review</span>';
    }
  }
}

// ==========================================
// REVIEWS SYSTEM
// ==========================================

async function loadReviews() {
  const grid = document.getElementById("reviewsGrid");
  if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-2); padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading reviews...</div>';

  try {
    const res = await fetch(API_BASE + "/api/reviews");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (data.reviews && data.reviews.length > 0) {
      allReviews = data.reviews;
      updateReviewsOverview(data.stats);
    } else {
      allReviews = [];
      updateReviewsOverview({
        total_reviews: 0,
        average_rating: 0,
        star_5: 0,
        star_4: 0,
        star_3: 0,
        star_2: 0,
        star_1: 0,
      });
    }
  } catch (err) {
    allReviews = [];
    updateReviewsOverview({
      total_reviews: 0,
      average_rating: 0,
      star_5: 0,
      star_4: 0,
      star_3: 0,
      star_2: 0,
      star_1: 0,
    });
  }

  renderReviews();
}

function calculateAndRenderStats() {
  const total = allReviews.length;
  if (total === 0) {
    updateReviewsOverview({
      total_reviews: 0,
      average_rating: 0,
      star_5: 0,
      star_4: 0,
      star_3: 0,
      star_2: 0,
      star_1: 0,
    });
    return;
  }
  const sum = allReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
  const avg = (sum / total).toFixed(1);

  const star5 = allReviews.filter(r => r.rating === 5).length;
  const star4 = allReviews.filter(r => r.rating === 4).length;
  const star3 = allReviews.filter(r => r.rating === 3).length;
  const star2 = allReviews.filter(r => r.rating === 2).length;
  const star1 = allReviews.filter(r => r.rating === 1).length;

  updateReviewsOverview({
    total_reviews: total,
    average_rating: avg,
    star_5: star5,
    star_4: star4,
    star_3: star3,
    star_2: star2,
    star_1: star1,
  });
}

function updateReviewsOverview(stats) {
  if (!stats) return;
  const total = stats.total_reviews !== undefined ? stats.total_reviews : allReviews.length;
  const avg = total > 0 ? parseFloat(stats.average_rating || 5.0).toFixed(1) : "—";

  const avgEl = document.getElementById("reviewAvgScore");
  if (avgEl) avgEl.textContent = avg;

  const countEl = document.getElementById("reviewTotalCount");
  if (countEl) {
    countEl.textContent = total > 0 ? `Based on ${total} verified review${total === 1 ? '' : 's'}` : "No reviews submitted yet";
  }

  const starOverviewEl = document.getElementById("reviewOverviewStars");
  if (starOverviewEl) {
    if (total > 0) {
      const fullStars = Math.round(parseFloat(avg));
      let starsHtml = "";
      for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="fas fa-star" style="color:${i <= fullStars ? '#fbbf24' : 'rgba(255,255,255,0.15)'};"></i>`;
      }
      starOverviewEl.innerHTML = starsHtml;
    } else {
      let starsHtml = "";
      for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="far fa-star" style="color:rgba(255,255,255,0.2);"></i>`;
      }
      starOverviewEl.innerHTML = starsHtml;
    }
  }

  // Update progress bars
  const p5 = total > 0 ? Math.round(((stats.star_5 || 0) / total) * 100) : 0;
  const p4 = total > 0 ? Math.round(((stats.star_4 || 0) / total) * 100) : 0;
  const p3 = total > 0 ? Math.round(((stats.star_3 || 0) / total) * 100) : 0;
  const p2 = total > 0 ? Math.round(((stats.star_2 || 0) / total) * 100) : 0;
  const p1 = total > 0 ? Math.round(((stats.star_1 || 0) / total) * 100) : 0;

  const setBar = (id, pct, countId) => {
    const el = document.getElementById(id);
    const cEl = document.getElementById(countId);
    if (el) el.style.width = pct + "%";
    if (cEl) cEl.textContent = pct + "%";
  };

  setBar("bar5", p5, "barCount5");
  setBar("bar4", p4, "barCount4");
  setBar("bar3", p3, "barCount3");
  setBar("bar2", p2, "barCount2");
  setBar("bar1", p1, "barCount1");
}

function renderReviews() {
  const grid = document.getElementById("reviewsGrid");
  if (!grid) return;

  let filtered = allReviews;
  if (currentReviewFilter !== "all") {
    if (["1", "2", "3", "4", "5"].includes(currentReviewFilter)) {
      const starNum = parseInt(currentReviewFilter);
      filtered = allReviews.filter(r => r.rating === starNum);
    } else {
      filtered = allReviews.filter(r => (r.game || "").toLowerCase() === currentReviewFilter.toLowerCase());
    }
  }

  if (filtered.length === 0) {
    const isFiltered = currentReviewFilter !== "all";
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-2); padding: 3.5rem 1rem;">
        <i class="fas ${isFiltered ? 'fa-filter' : 'fa-comment-slash'}" style="font-size: 2.2rem; margin-bottom: 0.85rem; opacity: 0.4; color: var(--cyan);"></i>
        <h3 style="color: #fff; margin-bottom: 0.4rem;">${isFiltered ? 'No reviews found' : 'No reviews yet'}</h3>
        <p style="max-width: 440px; margin: 0 auto; color: var(--text-3); font-size: 0.9rem;">
          ${isFiltered ? 'No reviews match the selected filter.' : 'No reviews have been posted yet. Verified Premium members can be the first to submit a review!'}
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(r => {
    const rating = Math.min(Math.max(parseInt(r.rating || 5), 1), 5);
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      starsHtml += `<i class="fas fa-star" style="color:${i <= rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'};"></i>`;
    }

    const avatarUrl = r.author_avatar && r.user_id
      ? `https://cdn.discordapp.com/avatars/${r.user_id}/${r.author_avatar}.png?size=128`
      : "assets/cyslogo.png";

    const isOwner = currentUser && (currentUser.id === r.user_id || currentUser.is_admin);
    let roleBadge = '<span class="review-badge-premium"><i class="fas fa-crown"></i> Verified Premium</span>';
    if (r.is_admin) {
      roleBadge = '<span class="review-badge-admin"><i class="fas fa-bolt"></i> Admin</span>';
    } else if (r.is_config_maker || r.is_creator || (r.author_role && (r.author_role.toLowerCase() === "creator" || r.author_role.toLowerCase().includes("maker")))) {
      roleBadge = '<span class="review-badge-creator"><i class="fas fa-hammer"></i> Config Maker</span>';
    }

    const timeAgo = formatTimeAgo(r.created_at);

    return `
      <div class="review-card">
        ${isOwner ? `<button class="review-delete-btn" onclick="deleteReview(${r.id})" title="Delete Review"><i class="fas fa-trash"></i></button>` : ''}
        <div class="review-card-header" onclick="openUserProfileModal('${r.user_id || ''}', ${r.id})" style="cursor: pointer;" title="View ${escapeHtml(r.author_name || 'User')}'s profile & stats">
          <img class="review-avatar" src="${avatarUrl}" alt="${escapeHtml(r.author_name || 'User')}" onerror="this.src='assets/cyslogo.png'">
          <div class="review-author-meta">
            <div class="review-author-name">
              <span>${escapeHtml(r.author_name || "Community Member")}</span>
              ${roleBadge}
            </div>
            <div class="review-date">${timeAgo}</div>
          </div>
        </div>

        <div class="review-stars-row">
          <div class="review-stars">${starsHtml}</div>
          <span class="review-game-tag">${escapeHtml(r.game || "General")}</span>
        </div>

        <div class="review-body">
          ${r.title ? `<div class="review-title">${escapeHtml(r.title)}</div>` : ''}
          <div class="review-comment">${escapeHtml(r.comment || "")}</div>
        </div>
      </div>
    `;
  }).join("");
}

function initReviewFilters() {
  const chips = document.querySelectorAll(".rev-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentReviewFilter = chip.dataset.filter;
      renderReviews();
    });
  });
}

// ==========================================
// REVIEW MODAL & STAR SELECTOR
// ==========================================

window.openReviewModal = function () {
  const modal = document.getElementById("reviewModal");
  if (!modal) return;

  const stateOut = document.getElementById("revStateLoggedOut");
  const stateFree = document.getElementById("revStateFreeUser");
  const statePrem = document.getElementById("revStatePremiumUser");

  const isConfigMaker = currentUser && (currentUser.is_config_maker || currentUser.is_creator);
  const isVerified = currentUser && (currentUser.is_premium || currentUser.is_admin || isConfigMaker);

  // Determine user state
  if (!currentUser) {
    stateOut.classList.remove("hidden");
    stateFree.classList.add("hidden");
    statePrem.classList.add("hidden");
  } else if (!isVerified) {
    // FREE USER (CANNOT SEND REVIEWS)
    stateOut.classList.add("hidden");
    stateFree.classList.remove("hidden");
    statePrem.classList.add("hidden");

    const freeUserEl = document.getElementById("revFreeUserName");
    if (freeUserEl) freeUserEl.textContent = currentUser.username;
    const avatar = document.getElementById("revFreeUserAvatar");
    if (avatar) {
      avatar.src = currentUser.avatar
        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`
        : "assets/cyslogo.png";
    }
  } else {
    // PREMIUM, CONFIG MAKER, OR ADMIN USER (CAN SEND REVIEWS)
    stateOut.classList.add("hidden");
    stateFree.classList.add("hidden");
    statePrem.classList.remove("hidden");

    const premUserEl = document.getElementById("revPremUserName");
    if (premUserEl) premUserEl.textContent = currentUser.username;
    const avatar = document.getElementById("revPremUserAvatar");
    if (avatar) {
      avatar.src = currentUser.avatar
        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`
        : "assets/cyslogo.png";
    }
    const roleEl = document.getElementById("revPremUserRole");
    if (roleEl) {
      if (currentUser.is_admin) {
        roleEl.innerHTML = '<i class="fas fa-bolt"></i> Verified Admin';
        roleEl.className = "user-role-chip admin-chip";
      } else if (isConfigMaker) {
        roleEl.innerHTML = '<i class="fas fa-hammer"></i> Config Maker';
        roleEl.className = "user-role-chip config-maker-chip";
      } else {
        roleEl.innerHTML = '<i class="fas fa-crown"></i> Verified Premium';
        roleEl.className = "user-role-chip premium-chip";
      }
    }

    // Check if user already submitted a review
    const existing = allReviews.find(r => currentUser && r.user_id === currentUser.id);
    const modalTitle = document.querySelector("#revStatePremiumUser .modal-title");
    const modalSub = document.querySelector("#revStatePremiumUser .modal-sub");
    const submitBtnText = document.getElementById("btnSubmitReviewText");

    if (existing) {
      if (modalTitle) modalTitle.textContent = "Edit Your Review";
      if (modalSub) modalSub.textContent = "Update your existing 1-5 star rating and feedback.";
      if (submitBtnText) submitBtnText.textContent = "Update Review";

      setStarRating(existing.rating || 5);
      const gameSelect = document.getElementById("reviewGameSelect");
      if (gameSelect && existing.game) gameSelect.value = existing.game;
      const titleInput = document.getElementById("reviewTitleInput");
      if (titleInput) titleInput.value = existing.title || "";
      const commentInput = document.getElementById("reviewCommentInput");
      if (commentInput) {
        commentInput.value = existing.comment || "";
        const charCount = document.getElementById("commentCharCount");
        if (charCount) charCount.textContent = `${commentInput.value.length} / 2000`;
      }
    } else {
      if (modalTitle) modalTitle.textContent = "Write a Review";
      if (modalSub) modalSub.textContent = "Rate your experience from 1 to 5 stars.";
      if (submitBtnText) submitBtnText.textContent = "Post Review";

      document.getElementById("reviewForm")?.reset();
      setStarRating(5);
      const charCount = document.getElementById("commentCharCount");
      if (charCount) charCount.textContent = "0 / 2000";
    }
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};

window.closeReviewModal = function () {
  const modal = document.getElementById("reviewModal");
  if (!modal) return;
  modal.classList.remove("active");
  document.body.style.overflow = "";
};

function initStarPicker() {
  const buttons = document.querySelectorAll(".star-btn");
  const label = document.getElementById("starRatingLabel");

  buttons.forEach(btn => {
    btn.addEventListener("mouseenter", () => {
      const r = parseInt(btn.dataset.rating);
      highlightStars(r);
      if (label) label.textContent = STAR_LABELS[r] || `${r} Stars`;
    });

    btn.addEventListener("mouseleave", () => {
      highlightStars(selectedStarRating);
      if (label) label.textContent = STAR_LABELS[selectedStarRating] || `${selectedStarRating} Stars`;
    });

    btn.addEventListener("click", () => {
      const r = parseInt(btn.dataset.rating);
      setStarRating(r);
    });
  });

  const commentInput = document.getElementById("reviewCommentInput");
  const charCount = document.getElementById("commentCharCount");
  if (commentInput && charCount) {
    commentInput.addEventListener("input", () => {
      charCount.textContent = `${commentInput.value.length} / 2000`;
    });
  }
}

function setStarRating(rating) {
  selectedStarRating = rating;
  highlightStars(rating);
  const label = document.getElementById("starRatingLabel");
  if (label) label.textContent = STAR_LABELS[rating] || `${rating} Stars`;
}

function highlightStars(rating) {
  const buttons = document.querySelectorAll(".star-btn");
  buttons.forEach(btn => {
    const val = parseInt(btn.dataset.rating);
    if (val <= rating) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

window.submitReview = async function (e) {
  e.preventDefault();
  if (!currentUser) {
    showToast("Please log in with Discord first.", "error");
    return;
  }

  // STRICT FRONTEND VALIDATION
  const isConfigMaker = currentUser.is_config_maker || currentUser.is_creator;
  if (!currentUser.is_premium && !currentUser.is_admin && !isConfigMaker) {
    showToast("Only Premium/Donator & Config Maker users can submit reviews.", "error");
    return;
  }

  const token = localStorage.getItem("ch_token");
  if (!token) {
    showToast("Session expired. Please log in again.", "error");
    return;
  }

  const game = document.getElementById("reviewGameSelect")?.value || "General";
  const title = document.getElementById("reviewTitleInput")?.value?.trim() || "";
  const comment = document.getElementById("reviewCommentInput")?.value?.trim() || "";

  if (comment.length < 5) {
    showToast("Please write at least 5 characters in your review.", "error");
    return;
  }

  const submitBtn = document.getElementById("btnSubmitReview");
  const submitText = document.getElementById("btnSubmitReviewText");
  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.textContent = "Posting...";

  try {
    const res = await fetch(API_BASE + "/api/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
      },
      body: JSON.stringify({
        rating: selectedStarRating,
        game: game,
        title: title,
        comment: comment,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to post review.");
    }

    showToast("Review submitted successfully! Thank you ⭐", "success");
    closeReviewModal();

    // Reset form
    document.getElementById("reviewForm")?.reset();
    setStarRating(5);

    // Refresh reviews
    loadReviews();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = "Post Review";
  }
};

window.deleteReview = async function (reviewId) {
  if (!confirm("Are you sure you want to delete this review?")) return;
  const token = localStorage.getItem("ch_token");
  if (!token) {
    showToast("Please log in to delete your review.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/reviews/${reviewId}`, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Failed to delete review");

    showToast("Review deleted successfully.", "success");
    allReviews = allReviews.filter(r => r.id !== reviewId);
    calculateAndRenderStats();
    renderReviews();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// ==========================================
// TOAST NOTIFICATIONS & UTILS
// ==========================================

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimeAgo(isoString) {
  if (!isoString) return "Recently";
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (isNaN(diffSec) || diffSec < 0) return "Recently";
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ==========================================
// CURRENT USER KEY SYSTEM & PROFILE VERIFIER
// ==========================================

async function verifyCurrentUserKeySystem() {
  const token = localStorage.getItem("ch_token");
  if (!currentUser || !currentUser.id || !token) {
    console.log("%c[KeySystem API] ℹ️ No user logged in with active session token.", "color: #94a3b8;");
    return;
  }

  console.log(`%c[KeySystem API] 🔒 Securely checking key status for: ${currentUser.username} (${currentUser.id})`, "color: #29f0f0; font-weight: bold; font-size: 13px;");
  console.log(`%c[KeySystem API] 📡 Querying backend proxy: ${API_BASE}/api/user/key-status`, "color: #94a3b8;");

  try {
    const res = await fetch(`${API_BASE}/api/user/key-status`, {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await res.json();

    console.log("%c[KeySystem API] 📥 Server Response:", "color: #d42dcc; font-weight: bold;", data);

    if (res.ok && data && data.success) {
      currentUser.key_data = data;
      currentUser.is_premium = !!data.active && !data.is_expired;
      currentUser.total_usage_seconds = parseInt(data.total_usage_time) || 0;
      currentUser.total_usage_hours = data.total_hours || parseFloat(((data.total_usage_time || 0) / 3600).toFixed(1));

      const statusText = data.is_expired ? "EXPIRED" : (data.active ? "ACTIVE PREMIUM" : "INACTIVE");
      const statusColor = (data.active && !data.is_expired) ? "color: #4ade80; font-weight: bold;" : "color: #f87171; font-weight: bold;";

      console.log(`%c[KeySystem API] 🛡️ Status: ${statusText} | ⏱️ Total Usage: ${currentUser.total_usage_hours} hrs (${currentUser.total_usage_seconds}s)`, statusColor);

      console.table({
        "Discord ID": data.user_id,
        "Active": data.active,
        "Total Seconds": data.total_usage_time,
        "Hours Farmed": currentUser.total_usage_hours + "h",
        "Expires At": data.expires_at || "Never (Lifetime)",
        "AE Access": !!data.games?.ae,
        "ALS Access": !!data.games?.als,
        "AV Access": !!data.games?.av,
        "ASTD Access": !!data.games?.astd
      });

      localStorage.setItem("ch_user", JSON.stringify(currentUser));
      updateNavbarAuthUI();
    } else {
      console.warn(`[KeySystem API] ⚠️ Key check response:`, data.message || "No active license key found");
      currentUser.key_data = null;
      currentUser.is_premium = false;
      currentUser.total_usage_seconds = 0;
      currentUser.total_usage_hours = 0;
      localStorage.setItem("ch_user", JSON.stringify(currentUser));
      updateNavbarAuthUI();
    }
  } catch (err) {
    console.error("[KeySystem API] ❌ Backend verification error:", err);
  }
}

window.openUserProfileModal = async function (targetUserId, reviewId) {
  const modal = document.getElementById("userProfileModal");
  if (!modal) return;

  // Locate review if opened from a review card
  const review = (allReviews && allReviews.length > 0)
    ? allReviews.find(r => (reviewId !== undefined && reviewId !== null && r.id == reviewId) || (targetUserId && r.user_id && r.user_id == targetUserId))
    : null;

  // Determine if viewing own profile
  const user = (typeof currentUser !== "undefined" && currentUser) || (typeof window !== "undefined" && window.currentUser) || null;
  let isOwnProfile = false;
  if (user) {
    if (!targetUserId && (reviewId === undefined || reviewId === null)) {
      isOwnProfile = true;
    } else if (targetUserId && String(targetUserId) === String(user.id)) {
      isOwnProfile = true;
    } else if (review && review.user_id && String(review.user_id) === String(user.id)) {
      isOwnProfile = true;
    }
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Elements
  const tagTextEl = document.getElementById("profModalTagText");
  const usernameEl = document.getElementById("profUsername");
  const totalHoursEl = document.getElementById("profTotalHours");
  const avatarImg = document.getElementById("profAvatar");
  const roleBadgeEl = document.getElementById("profRoleBadge");
  const licensePill = document.getElementById("profLicensePill");
  const joinedEl = document.getElementById("profJoinedDate");
  const rolesRow = document.getElementById("profDiscordRolesRow");
  const macrosRow = document.getElementById("profUnlockedMacrosRow");
  const logoutBtn = document.getElementById("profLogoutBtn");
  const closeBtn = document.getElementById("profCloseBtn");
  const privacyBox = document.getElementById("profPrivacyBox");

  const gameMap = {
    ae: "Anime Expeditions (AE)",
    als: "Anime Last Stand (ALS)",
    av: "Anime Vanguards (AV)",
    astd: "All Star Tower Defense (ASTD)",
    ac: "Anime Crusaders (AC)",
    utd: "Universal Tower Defense (UTD)",
    ao: "Anime Overload (AO)",
    aor: "Anime Origins (AOR)"
  };

  if (isOwnProfile && user) {
    // -------------------------------------------------------------
    // LOGGED-IN USER'S OWN PROFILE
    // -------------------------------------------------------------
    if (tagTextEl) tagTextEl.textContent = "Your Profile & Key Stats";
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
    if (closeBtn) closeBtn.style.display = "none";
    if (privacyBox) privacyBox.style.display = "flex";

    // Update privacy toggle UI
    const isPublic = user.is_public !== false;
    updateProfilePrivacyUI(isPublic);

    if (usernameEl) usernameEl.textContent = user.username;
    if (totalHoursEl) totalHoursEl.textContent = "...";

    let keyData = user.key_data || null;
    if (!keyData) {
      const token = localStorage.getItem("ch_token");
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/user/key-status`, {
            headers: { "Authorization": "Bearer " + token }
          });
          if (res.ok) {
            keyData = await res.json();
            user.key_data = keyData;
          }
        } catch (e) {}
      }
    }

    const totalSeconds = (keyData && keyData.total_usage_time) ? parseInt(keyData.total_usage_time) : (user.total_usage_seconds || 0);
    const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));
    const isActive = keyData ? (keyData.active && !keyData.is_expired) : !!user.is_premium;

    if (totalHoursEl) totalHoursEl.textContent = `${totalHours}h`;

    if (avatarImg) {
      avatarImg.src = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : "assets/cyslogo.png";
    }

    const isOwner = user.is_owner || user.id === "1141849395902554202" || (user.roles && user.roles.some(r => /owner/i.test(r)));
    if (roleBadgeEl) {
      if (isOwner) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip owner-chip"><i class="fas fa-crown"></i> Owner</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Owner / Lead Developer</strong></span>';
      } else if (user.is_admin) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip admin-chip"><i class="fas fa-bolt"></i> Admin</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Developer Admin</strong></span>';
      } else if (user.is_config_maker || user.is_creator) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip config-maker-chip"><i class="fas fa-hammer"></i> Config Maker</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Verified Config Creator</strong></span>';
      } else if (isActive) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip premium-chip"><i class="fas fa-crown"></i> Verified Premium</span>';
        const expireStr = (keyData && keyData.expires_at) ? `Expires: ${new Date(keyData.expires_at).toLocaleDateString()}` : "Active Lifetime";
        if (licensePill) licensePill.innerHTML = `<i class="fas fa-key"></i> <span>License: <strong>${expireStr}</strong></span>`;
      } else {
        roleBadgeEl.innerHTML = '<span class="user-role-chip free-chip"><i class="fas fa-user"></i> Free Member</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-lock"></i> <span>License: <strong>No Active Key</strong></span>';
      }
    }

    if (joinedEl) {
      if (keyData && keyData.created_at) {
        const jDate = new Date(keyData.created_at);
        joinedEl.innerHTML = `<i class="far fa-calendar-alt"></i> Key Created ${jDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      } else {
        joinedEl.innerHTML = `<i class="far fa-calendar-alt"></i> Joined via Discord • Your Account`;
      }
    }

    if (rolesRow) {
      let rolesList = [];
      if (isOwner) rolesList.push("Owner", "Developer", "Admin");
      else if (user.is_admin) rolesList.push("Server Admin", "Developer");
      if (user.is_config_maker || user.is_creator) rolesList.push("Config Maker");
      if (isActive) rolesList.push("Donator [All-Access]", "Verified Buyer");
      else rolesList.push("Member");
      if (Array.isArray(user.roles) && user.roles.length > 0) {
        rolesList = [...new Set([...rolesList, ...user.roles])];
      }
      rolesRow.innerHTML = rolesList.map(r => `
        <span class="prof-badge-chip cyan"><i class="fab fa-discord"></i> ${escapeHtml(r)}</span>
      `).join("");
    }

    if (macrosRow) {
      let unlocked = [];
      if (keyData && keyData.games) {
        for (const [key, label] of Object.entries(gameMap)) {
          if (keyData.games[key]) unlocked.push(label);
        }
      } else if (user.is_admin || isOwner) {
        unlocked = Object.values(gameMap);
      } else if (isActive) {
        unlocked = ["Anime Expeditions (AE)", "Anime Last Stand (ALS)", "Anime Vanguards (AV)"];
      }

      if (unlocked.length > 0) {
        macrosRow.innerHTML = unlocked.map(g => `
          <span class="prof-badge-chip pink"><i class="fas fa-check-circle"></i> ${escapeHtml(g)}</span>
        `).join("");
      } else {
        macrosRow.innerHTML = '<span class="prof-badge-chip" style="opacity: 0.6;"><i class="fas fa-lock"></i> No macro licenses linked</span>';
      }
    }

  } else {
    // -------------------------------------------------------------
    // OTHER USER'S PROFILE (E.G. CLICKED FROM REVIEWS)
    // -------------------------------------------------------------
    if (tagTextEl) tagTextEl.textContent = "Verified Reviewer Profile";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (closeBtn) closeBtn.style.display = "inline-flex";
    if (privacyBox) privacyBox.style.display = "none";

    // Initial values from review metadata
    let authorName = review ? (review.author_name || "Community Member") : (targetUserId ? `User (${String(targetUserId).slice(-4)})` : "Community Member");
    let avatarUrl = (review && review.author_avatar && review.user_id)
      ? `https://cdn.discordapp.com/avatars/${review.user_id}/${review.author_avatar}.png?size=128`
      : "assets/cyslogo.png";

    const isTargetOwner = (targetUserId === "1141849395902554202") || (review && (review.author_name === "Cys" || review.user_id === "1141849395902554202"));
    const isTargetAdmin = isTargetOwner || Boolean(review && review.is_admin);
    const isTargetConfigMaker = !isTargetOwner && !isTargetAdmin && Boolean(review && (review.is_config_maker || review.is_creator || (review.author_role && (review.author_role.toLowerCase() === "creator" || review.author_role.toLowerCase().includes("maker")))));
    const isTargetPremium = isTargetOwner || isTargetAdmin || (review ? review.is_verified_premium !== false : true);

    let joinedText = review && review.created_at
      ? `<i class="far fa-calendar-alt"></i> Verified Reviewer • ${formatTimeAgo(review.created_at)}`
      : '<i class="far fa-calendar-alt"></i> Verified Community Member';

    // Show initial data immediately
    if (usernameEl) usernameEl.textContent = authorName;
    if (totalHoursEl) totalHoursEl.textContent = "...";
    if (avatarImg) avatarImg.src = avatarUrl;

    if (roleBadgeEl) {
      if (isTargetOwner) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip owner-chip"><i class="fas fa-crown"></i> Owner</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Owner / Lead Developer</strong></span>';
      } else if (isTargetAdmin) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip admin-chip"><i class="fas fa-bolt"></i> Admin</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Developer Admin</strong></span>';
      } else if (isTargetConfigMaker) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip config-maker-chip"><i class="fas fa-hammer"></i> Config Maker</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Verified Config Creator</strong></span>';
      } else if (isTargetPremium) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip premium-chip"><i class="fas fa-crown"></i> Verified Premium</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Active Lifetime</strong></span>';
      } else {
        roleBadgeEl.innerHTML = '<span class="user-role-chip free-chip"><i class="fas fa-user"></i> Free Member</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-lock"></i> <span>License: <strong>Community Member</strong></span>';
      }
    }

    if (joinedEl) joinedEl.innerHTML = joinedText;

    let rolesList = [];
    if (isTargetOwner) rolesList = ["Owner", "Developer", "Admin", "Verified Buyer"];
    else if (isTargetAdmin) rolesList = ["Server Admin", "Developer", "Verified Buyer"];
    else if (isTargetConfigMaker) rolesList = ["Config Maker", "Donator [All-Access]", "Verified Buyer"];
    else if (isTargetPremium) rolesList = ["Donator [All-Access]", "Verified Buyer"];
    else rolesList = ["Community Member"];

    if (rolesRow) {
      rolesRow.innerHTML = rolesList.map(r => `
        <span class="prof-badge-chip cyan"><i class="fab fa-discord"></i> ${escapeHtml(r)}</span>
      `).join("");
    }

    let unlocked = [];
    if (isTargetOwner || isTargetAdmin) {
      unlocked = Object.values(gameMap);
    } else if (isTargetConfigMaker) {
      unlocked = ["Anime Expeditions (AE)", "Anime Last Stand (ALS)", "Anime Vanguards (AV)", "All Star Tower Defense (ASTD)"];
    } else {
      unlocked = ["Anime Expeditions (AE)", "Anime Last Stand (ALS)", "Anime Vanguards (AV)"];
      if (review && review.game) {
        const matching = Object.values(gameMap).find(g => g.toLowerCase().includes(review.game.toLowerCase()));
        if (matching && !unlocked.includes(matching)) {
          unlocked.push(matching);
        } else if (!matching && !unlocked.includes(review.game)) {
          unlocked.push(review.game);
        }
      }
    }

    if (macrosRow) {
      macrosRow.innerHTML = unlocked.map(g => `
        <span class="prof-badge-chip pink"><i class="fas fa-check-circle"></i> ${escapeHtml(g)}</span>
      `).join("");
    }

    // Query API for real-time live public stats & privacy status
    const resolvedUserId = (review && review.user_id) || targetUserId;
    if (resolvedUserId && /^\d{17,20}$/.test(String(resolvedUserId))) {
      try {
        const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(resolvedUserId)}/profile`);
        if (res.ok) {
          const profileData = await res.json();
          if (profileData && profileData.user) {
            if (profileData.user.username && usernameEl) usernameEl.textContent = profileData.user.username;
            if (profileData.user.avatar && avatarImg) {
              avatarImg.src = `https://cdn.discordapp.com/avatars/${profileData.user.id}/${profileData.user.avatar}.png?size=128`;
            }
            if (profileData.user.joined_at && joinedEl) {
              const jDate = new Date(profileData.user.joined_at);
              joinedEl.innerHTML = `<i class="far fa-calendar-alt"></i> Joined ${jDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }

            // Check Privacy Setting
            const isTargetPrivate = profileData.stats?.is_private || profileData.user?.is_public === false;
            if (isTargetPrivate) {
              if (tagTextEl) tagTextEl.textContent = "Verified Reviewer Profile • Private";
              if (totalHoursEl) totalHoursEl.innerHTML = '<span style="color: var(--text-3); font-size: 0.95rem; font-weight: 600;"><i class="fas fa-eye-slash"></i> Private</span>';
              if (macrosRow) {
                macrosRow.innerHTML = '<span class="prof-badge-chip" style="opacity: 0.6;"><i class="fas fa-eye-slash"></i> Hidden by user</span>';
              }
            } else {
              const hours = (profileData.stats && profileData.stats.total_hours != null) ? profileData.stats.total_hours : 0;
              if (totalHoursEl) totalHoursEl.textContent = `${hours}h`;
            }
          }
        } else {
          if (totalHoursEl) totalHoursEl.textContent = "0.0h";
        }
      } catch (e) {
        if (totalHoursEl) totalHoursEl.textContent = "0.0h";
      }
    } else {
      if (totalHoursEl) totalHoursEl.textContent = "0.0h";
    }
  }
};

window.toggleProfilePrivacy = async function (isPublic) {
  const user = (typeof currentUser !== "undefined" && currentUser) || (typeof window !== "undefined" && window.currentUser) || null;
  if (!user) return;
  user.is_public = isPublic;
  if (typeof currentUser !== "undefined" && currentUser) currentUser.is_public = isPublic;
  if (typeof window !== "undefined" && window.currentUser) window.currentUser.is_public = isPublic;
  localStorage.setItem("ch_user", JSON.stringify(user));
  updateProfilePrivacyUI(isPublic);

  const token = localStorage.getItem("ch_token");
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ is_public: isPublic })
      });
      if (res.ok) {
        showToast(isPublic ? "Farming stats are now Public." : "Farming stats are now Private.", "success");
      }
    } catch (e) {
      console.warn("[Profile Privacy] Persist error:", e);
    }
  }
};

function updateProfilePrivacyUI(isPublic) {
  const toggle = document.getElementById("profPrivacyToggle");
  const badge = document.getElementById("profPrivacyStateBadge");
  if (toggle) toggle.checked = isPublic;
  if (badge) {
    badge.textContent = isPublic ? "Public" : "Private";
    badge.className = `privacy-state-pill ${isPublic ? 'is-public' : 'is-private'}`;
  }
};

window.closeUserProfileModal = function () {
  const modal = document.getElementById("userProfileModal");
  if (!modal) return;
  modal.classList.remove("active");
  document.body.style.overflow = "";
};

// ==========================================
// PAGE INITIALIZATION
// ==========================================

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
  document.querySelectorAll('.macro-card, .step-card, .section-header, .review-card, .reviews-summary-card').forEach((el, i) => {
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
    p.style.background = Math.random() > 0.5 ? 'var(--cyan, #29f0f0)' : 'var(--pink, #d42dcc)';
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

document.addEventListener('DOMContentLoaded', () => {
  fetchAllRepoInfo();
  loadUserFromStorage();
  handleOAuthCallback();
  initScrollProgress();
  initNavbar();
  initActiveNav();
  initMobileNav();
  initBackToTop();
  initDownloadButtons();
  initSetupTabs();
  initDonateModal();
  initReviewFilters();
  initStarPicker();
  loadReviews();
  initReveal();
  initParticles();
  initHeroParallax();
  initHeroEntrance();
});