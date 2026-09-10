(function () {
  "use strict";

  // ==========================================
  // CONFIGURATION
  // ==========================================

  // Live Cloudflare Worker API URL
  var API_BASE = "https://cys-configs-api.cyszxz615.workers.dev";

  // CysLink Cloud Relay API URL
  var CYSLINK_API = localStorage.getItem("cyslink_api_override") || "https://cyslink.onrender.com";

  // Discord Application's Client ID
  var DISCORD_CLIENT_ID = "1363171262314188951";

  // OAuth2 redirect: automatically uses the current page URL (works for localhost, Live Server, and GitHub Pages)
  function getRedirectUri() {
    if (window.location.protocol === "file:" || !window.location.origin || window.location.origin === "null") {
      return "https://cyszx.github.io/configs/";
    }
    var uri = window.location.origin + window.location.pathname;
    uri = uri.replace(/\/index\.html$/i, "/");
    if (!uri.endsWith("/")) uri += "/";
    return uri;
  }
  var REDIRECT_URI = getRedirectUri();

  // Allowed file extensions for upload
  var ALLOWED_EXTENSIONS = [".txt", ".json", ".ini", ".cfg", ".zip"];
  var MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  // ==========================================
  // STATE
  // ==========================================

  var currentUser = null;
  var allConfigs = [];
  var currentFilter = "all";
  var currentSearch = "";
  var currentDetailConfig = null;
  var uploadTags = [];
  var uploadFiles = [];
  var isEditing = false;
  var editingConfigCode = null;

  // CysLink Remote State
  var activeMacroDevice = null;
  var userMacroDevicesList = [];
  var macroPollTimer = null;
  var macroModalOpen = false;

  // ==========================================
  // INITIALIZATION
  // ==========================================

  document.addEventListener("DOMContentLoaded", function () {
    loadUserFromStorage();
    handleOAuthCallback();
    initScrollProgress();
    initSearch();
    initFilters();
    initTagsInput();
    initFileUpload();
    initMobileNav();
    updateFavoritesBadge();
    loadConfigs();
    initMacroRemote();
  });

  function initScrollProgress() {
    var bar = document.getElementById("scrollProgress");
    if (!bar) return;
    window.addEventListener("scroll", function () {
      var total = document.documentElement.scrollHeight - window.innerHeight;
      var pct = total > 0 ? (window.scrollY / total) * 100 : 0;
      bar.style.width = pct + "%";
    }, { passive: true });
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  function loadUserFromStorage() {
    try {
      var userData = localStorage.getItem("ch_user");
      var token = localStorage.getItem("ch_token");
      if (userData && token) {
        currentUser = JSON.parse(userData);
        currentUser.is_owner = !!currentUser.is_owner || currentUser.id === "1141849395902554202";
        currentUser.is_admin = !!currentUser.is_admin || currentUser.is_owner;
        currentUser.is_premium = !!(currentUser.is_premium || currentUser.is_admin || currentUser.is_owner || currentUser.is_config_maker || currentUser.is_creator);
        currentUser.is_macro_tester = !!(currentUser.is_macro_tester || currentUser.is_owner || currentUser.is_admin);
        updateUIForLoggedIn();
        syncLiveUserRoles();
        checkMacroTesterAccess();
      }
    } catch (e) {
      localStorage.removeItem("ch_user");
      localStorage.removeItem("ch_token");
    }
  }

  function syncLiveUserRoles() {
    var token = localStorage.getItem("ch_token");
    if (!token) return;

    fetch(API_BASE + "/api/auth/me", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (res) {
        if (res.status === 401) {
          console.warn("[Auth Sync] Session expired or invalid.");
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.user) return;
        console.log("[Auth Sync] Live roles synced from server:", data);
        if (currentUser) {
          currentUser.is_owner = !!data.user.is_owner || currentUser.id === "1141849395902554202";
          currentUser.is_admin = !!data.user.is_admin || currentUser.is_owner;
          currentUser.is_premium = !!data.user.is_premium;
          currentUser.is_config_maker = !!data.user.is_config_maker;
          currentUser.is_creator = !!data.user.is_creator;
          currentUser.is_macro_tester = !!(data.user.is_macro_tester || currentUser.is_owner || currentUser.is_admin);
          localStorage.setItem("ch_user", JSON.stringify(currentUser));
          updateUIForLoggedIn();
          checkMacroTesterAccess();
        }
      })
      .catch(function (err) {
        console.warn("[Auth Sync] Could not sync live roles:", err);
      });
  }

  window.startDiscordLogin = function () {
    var params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds.members.read guilds",
      prompt: "consent",
    });
    window.location.href =
      "https://discord.com/api/oauth2/authorize?" + params.toString();
  };

  function handleOAuthCallback() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    if (!code) return;

    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);

    // Exchange code for token via our API
    fetch(API_BASE + "/api/auth/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, redirect_uri: REDIRECT_URI }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) {
          showToast("Login failed: " + data.error, "error");
          return;
        }
        currentUser = data.user;
        currentUser.is_owner = !!currentUser.is_owner || currentUser.id === "1141849395902554202";
        currentUser.is_admin = !!currentUser.is_admin || currentUser.is_owner;
        currentUser.is_premium = !!(currentUser.is_premium || currentUser.is_admin || currentUser.is_owner || currentUser.is_config_maker || currentUser.is_creator);
        currentUser.is_macro_tester = !!(data.user.is_macro_tester || currentUser.is_owner || currentUser.is_admin);
        localStorage.setItem("ch_user", JSON.stringify(currentUser));
        localStorage.setItem("ch_token", data.token);
        updateUIForLoggedIn();
        checkMacroTesterAccess().then(function (allowed) {
          if (allowed) {
            syncUserMacroDevices(true);
          }
        });
        var roleTitle = currentUser.is_owner
          ? " (Owner)"
          : (currentUser.is_admin
            ? " (Admin)"
            : ((currentUser.is_config_maker || currentUser.is_creator)
              ? " (Config Maker)"
              : (currentUser.is_premium ? " (Donator)" : "")));
        showToast("Logged in as " + currentUser.username + roleTitle, "success");
      })
      .catch(function (err) {
        console.error("Auth error:", err);
        showToast("Login connection error: " + (err.message || "Failed to connect to API"), "error");
      });
  }

  function updateUIForLoggedIn() {
    if (!currentUser) return;

    document.getElementById("btn-login").classList.add("hidden");
    var navUser = document.getElementById("nav-user");
    navUser.classList.remove("hidden");
    document.getElementById("nav-user-name").textContent =
      currentUser.username;

    var isOwner = currentUser.is_owner || currentUser.id === "1141849395902554202" || (currentUser.roles && currentUser.roles.some(function (r) { return /owner/i.test(r); }));

    // Set role badge
    var roleBadge = document.getElementById("nav-user-badge");
    if (roleBadge) {
      roleBadge.className = "user-role-badge";
      if (isOwner) {
        roleBadge.textContent = "Owner";
        roleBadge.classList.add("owner");
      } else if (currentUser.is_admin) {
        roleBadge.textContent = "Admin";
        roleBadge.classList.add("admin");
      } else if (currentUser.is_config_maker || currentUser.is_creator) {
        roleBadge.textContent = "Config Maker";
        roleBadge.classList.add("config-maker");
      } else if (currentUser.is_premium) {
        roleBadge.textContent = "Donator";
        roleBadge.classList.add("premium");
      } else {
        roleBadge.textContent = "Member";
        roleBadge.classList.add("member");
      }
    }

    var avatarUrl = currentUser.avatar
      ? "https://cdn.discordapp.com/avatars/" +
        currentUser.id +
        "/" +
        currentUser.avatar +
        ".png?size=64"
      : "../assets/cyslogo.png";
    document.getElementById("nav-user-avatar").src = avatarUrl;

    document.getElementById("nav-my-configs").classList.remove("hidden");
    document.getElementById("btn-my-configs").classList.remove("hidden");
    checkMacroTesterAccess();
  }

  window.openUserProfileModal = async function () {
    var modal = document.getElementById("userProfileModal");
    if (!modal) return;

    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    // Loading state
    document.getElementById("profUsername").textContent = currentUser ? currentUser.username : "Loading Profile...";
    document.getElementById("profTotalHours").textContent = "...";

    var keyData = null;
    var token = localStorage.getItem("ch_token");
    if (token) {
      try {
        var res = await fetch(API_BASE + "/api/user/key-status", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (res.ok) {
          keyData = await res.json();
        }
      } catch (e) {}
    }

    var username = currentUser ? currentUser.username : "Grinder";
    var avatar = currentUser ? currentUser.avatar : null;
    var totalSeconds = (keyData && keyData.total_usage_time) ? parseInt(keyData.total_usage_time) : 0;
    var totalHours = parseFloat((totalSeconds / 3600).toFixed(1));
    var isActive = keyData ? (keyData.active && !keyData.is_expired) : (currentUser ? currentUser.is_premium : false);
    var isOwner = currentUser && (currentUser.is_owner || currentUser.id === "1141849395902554202" || (currentUser.roles && currentUser.roles.some(function (r) { return /owner/i.test(r); })));

    document.getElementById("profUsername").textContent = username;
    document.getElementById("profTotalHours").textContent = totalHours + "h";

    var avatarImg = document.getElementById("profAvatar");
    if (avatarImg) {
      avatarImg.src = (avatar && currentUser)
        ? "https://cdn.discordapp.com/avatars/" + currentUser.id + "/" + avatar + ".png?size=128"
        : "../assets/cyslogo.png";
    }

    // Role Chip & License
    var roleBadgeEl = document.getElementById("profRoleBadge");
    var licensePill = document.getElementById("profLicensePill");
    if (roleBadgeEl) {
      if (isOwner) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip owner-chip"><i class="fas fa-crown"></i> Owner</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Owner / Lead Developer</strong></span>';
      } else if (currentUser && currentUser.is_admin) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip admin-chip"><i class="fas fa-bolt"></i> Admin</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>Developer Admin</strong></span>';
      } else if (isActive) {
        roleBadgeEl.innerHTML = '<span class="user-role-chip premium-chip"><i class="fas fa-crown"></i> Verified Premium</span>';
        var expireStr = (keyData && keyData.expires_at) ? "Expires: " + new Date(keyData.expires_at).toLocaleDateString() : "Active Lifetime";
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-key"></i> <span>License: <strong>' + expireStr + '</strong></span>';
      } else {
        roleBadgeEl.innerHTML = '<span class="user-role-chip free-chip"><i class="fas fa-user"></i> Free Member</span>';
        if (licensePill) licensePill.innerHTML = '<i class="fas fa-lock"></i> <span>License: <strong>No Active Key</strong></span>';
      }
    }

    // Joined date
    var joinedEl = document.getElementById("profJoinedDate");
    if (joinedEl) {
      if (keyData && keyData.created_at) {
        var jDate = new Date(keyData.created_at);
        joinedEl.innerHTML = '<i class="far fa-calendar-alt"></i> Key Created ' + jDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      } else {
        joinedEl.innerHTML = '<i class="far fa-calendar-alt"></i> Community Member';
      }
    }

    // Discord Roles List
    var rolesRow = document.getElementById("profDiscordRolesRow");
    if (rolesRow) {
      var rolesList = [];
      if (isOwner) {
        rolesList.push("Owner", "Developer", "Admin");
      } else if (currentUser && currentUser.is_admin) {
        rolesList.push("Server Admin", "Developer");
      }
      if (currentUser && (currentUser.is_config_maker || currentUser.is_creator)) {
        rolesList.push("Config Maker");
      }
      if (isActive) {
        rolesList.push("Donator [All-Access]", "Verified Buyer");
      } else {
        rolesList.push("Member");
      }

      if (currentUser && Array.isArray(currentUser.roles) && currentUser.roles.length > 0) {
        currentUser.roles.forEach(function (r) {
          if (rolesList.indexOf(r) === -1) rolesList.push(r);
        });
      }

      rolesRow.innerHTML = rolesList.map(function (r) {
        return '<span class="prof-badge-chip cyan"><i class="fab fa-discord"></i> ' + escapeHtml(r) + '</span>';
      }).join("");
    }

    // Unlocked Macros List
    var macrosRow = document.getElementById("profUnlockedMacrosRow");
    if (macrosRow) {
      var gameMap = {
        ae: "Anime Expeditions (AE)",
        als: "Anime Last Stand (ALS)",
        av: "Anime Vanguards (AV)",
        astd: "All Star Tower Defense (ASTD)",
        ac: "Anime Crusaders (AC)",
        utd: "Universal Tower Defense (UTD)",
        ao: "Anime Overload (AO)",
        aor: "Anime Origins (AOR)"
      };

      var unlocked = [];
      if (keyData && keyData.games) {
        for (var key in gameMap) {
          if (keyData.games[key]) unlocked.push(gameMap[key]);
        }
      } else if (currentUser && currentUser.is_admin) {
        for (var k in gameMap) unlocked.push(gameMap[k]);
      } else if (isActive) {
        unlocked = ["Anime Expeditions (AE)", "Anime Last Stand (ALS)", "Anime Vanguards (AV)"];
      }

      if (unlocked.length > 0) {
        macrosRow.innerHTML = unlocked.map(function (g) {
          return '<span class="prof-badge-chip pink"><i class="fas fa-check-circle"></i> ' + escapeHtml(g) + '</span>';
        }).join("");
      } else {
        macrosRow.innerHTML = '<span class="prof-badge-chip" style="opacity: 0.6;"><i class="fas fa-lock"></i> No macro licenses linked</span>';
      }
    }
  };

  window.closeUserProfileModal = function () {
    var modal = document.getElementById("userProfileModal");
    if (!modal) return;
    modal.classList.remove("active");
    document.body.style.overflow = "";
  };

  window.logoutUser = function () {
    currentUser = null;
    isMacroTester = false;
    localStorage.removeItem("ch_user");
    localStorage.removeItem("ch_token");
    location.reload();
  };

  function getAuthHeaders() {
    var token = localStorage.getItem("ch_token");
    if (!token) return {};
    return { Authorization: "Bearer " + token };
  }

  // ==========================================
  // CONFIGS — FETCHING & RENDERING
  // ==========================================

  function loadConfigs() {
    showSpinner(true);

    var url = API_BASE + "/api/configs";
    var params = [];
    if (currentFilter && currentFilter !== "all")
      params.push("mode=" + encodeURIComponent(currentFilter));
    if (currentSearch)
      params.push("search=" + encodeURIComponent(currentSearch));
    if (params.length > 0) url += "?" + params.join("&");

    fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        showSpinner(false);
        if (data.error) {
          showEmpty(true);
          return;
        }
        allConfigs = data.configs || [];
        updateStats(data.stats || {});
        renderTrending(data.trending || []);
        renderConfigs(allConfigs);
      })
      .catch(function () {
        showSpinner(false);
        // Clean initial state (no fake data)
        loadEmptyState();
      });
  }

  function loadEmptyState() {
    allConfigs = [];
    updateStats({
      total_configs: 0,
      total_downloads: 0,
      total_creators: 0,
    });
    renderTrending([]);
    renderConfigs([]);
  }

  function updateStats(stats) {
    document.getElementById("stat-total-configs").textContent =
      formatNumber(stats.total_configs || allConfigs.length || 0);
    document.getElementById("stat-total-downloads").textContent =
      formatNumber(stats.total_downloads || 0);
    document.getElementById("stat-total-creators").textContent =
      formatNumber(stats.total_creators || 0);
  }

  function renderTrending(configs) {
    var section = document.getElementById("trending-section");
    var grid = document.getElementById("trending-grid");
    if (!grid) return;
    grid.innerHTML = "";

    var top = (configs || [])
      .filter(function (c) { return (c.downloads || 0) > 0; })
      .sort(function (a, b) {
        return (b.downloads || 0) - (a.downloads || 0);
      })
      .slice(0, 3);

    if (top.length === 0) {
      if (section) section.style.display = "none";
      return;
    }

    if (section) section.style.display = "block";

    top.forEach(function (config, i) {
      var card = document.createElement("div");
      card.className = "trending-card trending-card-" + (i + 1);
      card.onclick = function () {
        openDetailModal(config);
      };

      var avatarUrl = config.author_avatar
        ? "https://cdn.discordapp.com/avatars/" +
          config.author_id +
          "/" +
          config.author_avatar +
          ".png?size=32"
        : "https://cdn.discordapp.com/embed/avatars/" +
          (parseInt(config.author_id || "0") % 5) +
          ".png";

      var rankHtml = "";
      if (i === 0) {
        rankHtml = '<span class="trending-rank-badge rank-1"><i class="fas fa-crown"></i> #1 Most Popular</span>';
      } else if (i === 1) {
        rankHtml = '<span class="trending-rank-badge rank-2"><i class="fas fa-medal"></i> #2 Trending</span>';
      } else {
        rankHtml = '<span class="trending-rank-badge rank-3"><i class="fas fa-award"></i> #3 Trending</span>';
      }

      var trendingTimeHtml = '';
      if (config.created_at) {
        trendingTimeHtml = '<div class="trending-time-meta">';
        trendingTimeHtml += '<span class="time-badge upload-time" title="Uploaded ' + formatDate(config.created_at) + '"><i class="far fa-clock"></i> ' + formatTimeAgo(config.created_at) + '</span>';
        if (isEdited(config.created_at, config.updated_at)) {
          trendingTimeHtml += '<span class="time-badge edited-time" title="Last edited ' + formatDate(config.updated_at) + '"><i class="fas fa-pen-nib"></i> Edited ' + formatTimeAgo(config.updated_at) + '</span>';
        }
        trendingTimeHtml += '</div>';
      }

      card.innerHTML =
        '<div class="trending-card-glow"></div>' +
        '<div class="trending-card-header">' +
        '  <div class="trending-badges-group">' +
        '    <span class="game-badge">' + escapeHtml(config.game || "Anime Expeditions") + '</span>' +
        (config.mode && config.mode !== "all" ? '    <span class="trending-mode-chip">' + escapeHtml(config.mode) + '</span>' : '') +
        '  </div>' +
        rankHtml +
        '</div>' +
        '<div class="trending-card-body">' +
        '  <div class="trending-card-title-row">' +
        '    <h3 class="trending-title" title="' + escapeHtml(config.name) + '">' + escapeHtml(config.name) + '</h3>' +
        '    <span class="share-code-badge" onclick="event.stopPropagation(); copyShareCodeText(\'' + escapeHtml(config.share_code) + '\')" title="Click to copy code">' +
        '      <i class="fas fa-copy"></i> ' + escapeHtml(config.share_code) +
        '    </span>' +
        '  </div>' +
        trendingTimeHtml +
        '</div>' +
        '<div class="trending-card-footer">' +
        '  <div class="trending-author">' +
        '    <img src="' + avatarUrl + '" alt="' + escapeHtml(config.author_name || "Author") + '" />' +
        '    <span>' + escapeHtml(config.author_name || "Community") + '</span>' +
        '  </div>' +
        '  <div class="trending-stats">' +
        '    <button class="btn-card-macro" onclick="event.stopPropagation(); window.quickSendToMacro(\'' + escapeHtml(config.share_code) + '\', \'' + escapeHtml(config.name) + '\')" title="Send directly to Macro"><i class="fas fa-bolt"></i></button>' +
        '    <span class="stat-pill downloads"><i class="fas fa-download"></i> ' + formatNumber(config.downloads || 0) + '</span>' +
        '    <span class="stat-pill files"><i class="fas fa-file-alt"></i> ' + (config.file_count || 1) + ' file' + (config.file_count !== 1 ? 's' : '') + '</span>' +
        '  </div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  function renderConfigs(configs) {
    var grid = document.getElementById("configs-grid");
    grid.innerHTML = "";

    var badge = document.getElementById("configs-count-badge");
    badge.textContent = configs.length + " config" + (configs.length !== 1 ? "s" : "");

    if (configs.length === 0) {
      showEmpty(true);
      return;
    }
    showEmpty(false);

    configs.forEach(function (config, index) {
      var tags = [];
      try {
        tags = JSON.parse(config.tags || "[]");
      } catch (e) {
        tags = [];
      }

      var avatarUrl = config.author_avatar
        ? "https://cdn.discordapp.com/avatars/" +
          config.author_id +
          "/" +
          config.author_avatar +
          ".png?size=32"
        : "https://cdn.discordapp.com/embed/avatars/" +
          (parseInt(config.author_id || "0") % 5) +
          ".png";

      var tagsHtml = tags
        .slice(0, 3)
        .map(function (t) {
          return '<span class="config-tag">' + escapeHtml(t) + "</span>";
        })
        .join("");

      var authorBadgeHtml = "";
      var role = (config.author_role || "").toLowerCase();
      var authorId = String(config.author_id || "");
      if (authorId === "1141849395902554202" || role === "owner") {
        authorBadgeHtml = '<span class="author-badge badge-owner"><i class="fas fa-crown"></i> OWNER</span>';
      } else if (role === "admin") {
        authorBadgeHtml = '<span class="author-badge badge-admin"><i class="fas fa-bolt"></i> STAFF</span>';
      } else if (role === "creator" || role === "config maker" || role === "config_maker" || role === "config makers") {
        authorBadgeHtml = '<span class="author-badge badge-creator"><i class="fas fa-hammer"></i> CREATOR</span>';
      } else if (role === "donator" || config.is_premium) {
        authorBadgeHtml = '<span class="author-badge badge-donator"><i class="fas fa-gem"></i> DONATOR</span>';
      }

      var card = document.createElement("div");
      card.className = "config-card";
      card.style.animationDelay = Math.min(index * 0.04, 0.4) + "s";
      card.onclick = function () {
        openDetailModal(config);
      };

      var timeMetaHtml = '<div class="config-time-meta">';
      if (config.created_at) {
        timeMetaHtml += '<span class="time-badge upload-time" title="Uploaded ' + formatDate(config.created_at) + '"><i class="far fa-clock"></i> Uploaded ' + formatTimeAgo(config.created_at) + '</span>';
      }
      if (isEdited(config.created_at, config.updated_at)) {
        timeMetaHtml += '<span class="time-badge edited-time" title="Last edited ' + formatDate(config.updated_at) + '"><i class="fas fa-pen-nib"></i> Edited ' + formatTimeAgo(config.updated_at) + '</span>';
      }
      timeMetaHtml += '</div>';

      card.innerHTML =
        '<div class="config-glow"></div>' +
        '<div class="config-card-header">' +
        '  <div class="config-badges-row">' +
        '    <span class="game-badge">' + escapeHtml(config.game || "Anime Expeditions") + '</span>' +
        (config.mode && config.mode !== "all" ? '    <span class="trending-mode-chip">' + escapeHtml(config.mode) + '</span>' : '') +
        '  </div>' +
        '  <span class="share-code-badge" onclick="event.stopPropagation(); copyShareCodeText(\'' + escapeHtml(config.share_code) + '\')" title="Click to copy share code">' +
        '    <i class="fas fa-copy"></i> ' + escapeHtml(config.share_code) +
        '  </span>' +
        '</div>' +
        '<div class="config-card-body">' +
        '  <h3 class="config-card-title" title="' + escapeHtml(config.name) + '">' + escapeHtml(config.name) + '</h3>' +
        '  <p class="config-card-desc">' + escapeHtml(config.description || "Community configuration optimized for automated farming.") + '</p>' +
        '  <div class="config-card-tags">' + (tagsHtml || '<span class="config-tag">General</span>') + '</div>' +
        timeMetaHtml +
        '</div>' +
        '<div class="config-card-footer">' +
        '  <div class="config-author">' +
        '    <img src="' + avatarUrl + '" alt="' + escapeHtml(config.author_name || "Unknown") + '" />' +
        '    <span class="author-name">' + escapeHtml(config.author_name || "Community") + '</span>' +
        authorBadgeHtml +
        '  </div>' +
        '  <div class="config-stats">' +
        '    <button class="btn-card-fav' + (isFavorited(config.share_code) ? ' favorited' : '') + '" id="btn-fav-' + config.share_code + '" onclick="event.stopPropagation(); toggleFavorite(\'' + config.share_code + '\', event)" title="Favorite">' +
        '      <i class="' + (isFavorited(config.share_code) ? 'fas' : 'far') + ' fa-star"></i>' +
        '    </button>' +
        '    <button class="btn-like" id="btn-like-' + config.share_code + '" onclick="event.stopPropagation(); toggleLike(\'' + config.share_code + '\')" title="Upvote">' +
        '      <i class="fas fa-heart"></i> <span id="likes-' + config.share_code + '">' + (config.likes || 0) + '</span>' +
        '    </button>' +
        '    <button class="btn-card-macro" onclick="event.stopPropagation(); window.quickSendToMacro(\'' + escapeHtml(config.share_code) + '\', \'' + escapeHtml(config.name) + '\')" title="Send directly to Macro"><i class="fas fa-bolt"></i></button>' +
        '    <span class="stat-pill downloads"><i class="fas fa-download"></i> ' + formatNumber(config.downloads || 0) + '</span>' +
        '  </div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  // ==========================================
  // SEARCH & FILTER
  // ==========================================

  function initSearch() {
    var input = document.getElementById("search-input");
    var debounceTimer;
    input.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        currentSearch = input.value.trim();
        filterAndRender();
      }, 300);
    });
  }

  function initFilters() {
    var chips = document.querySelectorAll(".filter-chip");
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        currentFilter = chip.getAttribute("data-filter") || chip.getAttribute("data-mode") || "all";
        filterAndRender();
      });
    });
  }

  function filterAndRender() {
    var filtered = allConfigs.filter(function (c) {
      if (currentFilter === "favorites") {
        if (!isFavorited(c.share_code)) return false;
      } else if (currentFilter && currentFilter !== "all") {
        var f = currentFilter.toLowerCase();
        var g = (c.game || "").toLowerCase();
        var m = (c.mode || "").toLowerCase();

        var matchesFilter = g.includes(f) || m.includes(f);
        if (!matchesFilter) {
          if (f.includes("all star") && g.includes("astd")) matchesFilter = true;
          else if (f.includes("astd") && g.includes("all star")) matchesFilter = true;
        }
        if (!matchesFilter) return false;
      }
      if (!currentSearch) return true;

      var search = currentSearch.toLowerCase();
      return (
        (c.game || "").toLowerCase().includes(search) ||
        (c.name || "").toLowerCase().includes(search) ||
        (c.description || "").toLowerCase().includes(search) ||
        (c.share_code || "").toLowerCase().includes(search) ||
        (c.author_name || "").toLowerCase().includes(search) ||
        (c.mode || "").toLowerCase().includes(search) ||
        (c.map_name || "").toLowerCase().includes(search) ||
        (c.tags || "").toLowerCase().includes(search)
      );
    });
    renderConfigs(filtered);
  }

  // ==========================================
  // MY CONFIGS
  // ==========================================

  window.showMyConfigs = function () {
    if (!currentUser) {
      showToast("Please log in to view your configs", "error");
      return;
    }

    var myConfigs = allConfigs.filter(function (c) {
      return c.author_id === currentUser.id;
    });

    // Clear other filters
    document.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    var allChip = document.querySelector('[data-filter="all"]') || document.querySelector('[data-mode="all"]');
    if (allChip) allChip.classList.add("active");
    currentFilter = "all";
    currentSearch = "";
    document.getElementById("search-input").value = "";

    renderConfigs(myConfigs);
    document.getElementById("configs-count-badge").textContent =
      myConfigs.length + " of your configs";

    document.getElementById("browse").scrollIntoView({ behavior: "smooth" });
  };

  // ==========================================
  // DETAIL MODAL
  // ==========================================

  function openDetailModal(config) {
    currentDetailConfig = config;

    var gameEl = document.getElementById("detail-game");
    if (gameEl) gameEl.textContent = config.game || "Anime Expeditions";
    var modeBadgeEl = document.getElementById("detail-mode-badge");
    if (modeBadgeEl) {
      if (config.mode && config.mode !== "all") {
        modeBadgeEl.textContent = config.mode;
        modeBadgeEl.style.display = "inline-flex";
      } else {
        modeBadgeEl.style.display = "none";
      }
    }
    var titleEl = document.getElementById("detail-title");
    if (titleEl) titleEl.textContent = config.name;
    var codeEl = document.getElementById("detail-code");
    if (codeEl) codeEl.textContent = config.share_code;
    var modeEl = document.getElementById("detail-mode");
    if (modeEl) modeEl.textContent = config.mode || "-";
    var mapEl = document.getElementById("detail-map");
    if (mapEl) mapEl.textContent = config.map_name || "-";
    var dlEl = document.getElementById("detail-downloads");
    if (dlEl) dlEl.textContent = formatNumber(config.downloads || 0);
    var likesEl = document.getElementById("detail-likes-num");
    if (likesEl) likesEl.textContent = formatNumber(config.likes || 0);
    var createdEl = document.getElementById("detail-created");
    var createdChip = document.getElementById("detail-created-chip");
    var createdText = document.getElementById("detail-created-text");
    if (config.created_at) {
      var dateStr = formatDate(config.created_at);
      var agoStr = formatTimeAgo(config.created_at);
      if (createdEl) createdEl.textContent = dateStr + " (" + agoStr + ")";
      if (createdText) createdText.textContent = "Uploaded " + agoStr;
      if (createdChip) {
        createdChip.style.display = "inline-flex";
        createdChip.title = "Uploaded: " + dateStr + " (" + agoStr + ")";
      }
    } else {
      if (createdEl) createdEl.textContent = "-";
      if (createdChip) createdChip.style.display = "none";
    }

    var editedWrap = document.getElementById("detail-edited-wrap");
    var editedEl = document.getElementById("detail-edited");
    var editedChip = document.getElementById("detail-edited-chip");
    var editedText = document.getElementById("detail-edited-text");
    if (isEdited(config.created_at, config.updated_at)) {
      var editDateStr = formatDate(config.updated_at);
      var editAgoStr = formatTimeAgo(config.updated_at);
      if (editedEl) editedEl.textContent = editDateStr + " (" + editAgoStr + ")";
      if (editedText) editedText.textContent = "Edited " + editAgoStr;
      if (editedWrap) editedWrap.classList.remove("hidden");
      if (editedChip) {
        editedChip.classList.remove("hidden");
        editedChip.title = "Last Edited: " + editDateStr + " (" + editAgoStr + ")";
      }
    } else {
      if (editedWrap) editedWrap.classList.add("hidden");
      if (editedChip) editedChip.classList.add("hidden");
    }

    var descEl = document.getElementById("detail-description");
    if (descEl) descEl.textContent = config.description || "No description provided.";

    // Tags
    var tagsContainer = document.getElementById("detail-tags");
    tagsContainer.innerHTML = "";
    var tags = [];
    try {
      tags = JSON.parse(config.tags || "[]");
    } catch (e) {
      tags = [];
    }
    tags.forEach(function (t) {
      var span = document.createElement("span");
      span.className = "config-tag";
      span.textContent = t;
      tagsContainer.appendChild(span);
    });

    // Config preview
    var previewEl = document.getElementById("detail-preview");
    var rawData = config.config_data || "";

    if (rawData.startsWith("data:application/zip;base64,")) {
      previewEl.textContent = "Reading ZIP archive contents...";
      parseAndPreviewZip(rawData, function (previewText) {
        previewEl.textContent = previewText;
      });
    } else {
      var lines = rawData.split("\n");
      if (lines.length > 25) {
        rawData = lines.slice(0, 25).join("\n") + "\n\n... (" + lines.length + " lines total)";
      }
      previewEl.textContent = rawData;
    }

    // Show edit button ONLY if current user is the original author
    var isAuthor = currentUser && (currentUser.id === config.author_id);
    var isOwnerOrAdmin = currentUser && (currentUser.id === config.author_id || currentUser.is_admin);

    var editBtn = document.getElementById("btn-edit-config");
    if (editBtn) {
      if (isAuthor) editBtn.classList.remove("hidden");
      else editBtn.classList.add("hidden");
    }
    var editHeaderBtn = document.getElementById("btn-edit-header");
    if (editHeaderBtn) {
      if (isAuthor) editHeaderBtn.classList.remove("hidden");
      else editHeaderBtn.classList.add("hidden");
    }
    var deleteBtn = document.getElementById("btn-delete-config");
    if (deleteBtn) {
      if (isOwnerOrAdmin) deleteBtn.classList.remove("hidden");
      else deleteBtn.classList.add("hidden");
    }

    // Reset copy button
    var copyBtn = document.getElementById("btn-copy-code");
    if (copyBtn) {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
      copyBtn.onclick = copyShareCode;
    }

    // Update Favorite button in detail modal
    var detailFavBtn = document.getElementById("btn-fav-detail");
    if (detailFavBtn) {
      var isFav = isFavorited(config.share_code);
      if (isFav) {
        detailFavBtn.classList.add("favorited");
        detailFavBtn.innerHTML = '<i class="fas fa-star"></i> <span>Favorited</span>';
      } else {
        detailFavBtn.classList.remove("favorited");
        detailFavBtn.innerHTML = '<i class="far fa-star"></i> <span>Favorite</span>';
      }
    }

    // Populate likes in detail modal
    var detailLikesNum = document.getElementById("detail-likes-num");
    if (detailLikesNum) detailLikesNum.textContent = config.likes || 0;

    openModal("detail-modal");
  }

  function copyToClipboard(text, onSuccess, onError) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (onSuccess) onSuccess();
      }).catch(function () {
        fallbackCopy(text, onSuccess, onError);
      });
    } else {
      fallbackCopy(text, onSuccess, onError);
    }
  }

  function fallbackCopy(text, onSuccess, onError) {
    try {
      var textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      var successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        if (onSuccess) onSuccess();
      } else {
        if (onError) onError();
      }
    } catch (err) {
      if (onError) onError(err);
    }
  }

  window.copyShareCode = function () {
    if (!currentDetailConfig || !currentDetailConfig.share_code) return;
    var code = currentDetailConfig.share_code;
    var btn = document.getElementById("btn-copy-code");
    copyToClipboard(code, function () {
      if (btn) {
        btn.classList.add("copied");
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.innerHTML = '<i class="fas fa-copy"></i> Copy Code';
        }, 2000);
      }
      showToast("Copied share code: " + code, "success");
    }, function () {
      showToast("Failed to copy to clipboard", "error");
    });
  };

  window.copyPreviewText = function () {
    if (!currentDetailConfig) return;
    var rawData = currentDetailConfig.config_data || "";
    copyToClipboard(rawData, function () {
      showToast("Raw config code copied!", "success");
    }, function () {
      showToast("Failed to copy code", "error");
    });
  };

  window.copyShareCodeText = function (code) {
    if (!code) return;
    copyToClipboard(code, function () {
      showToast("Copied: " + code, "success");
    }, function () {
      showToast("Failed to copy code", "error");
    });
  };

  window.toggleLike = function (code) {
    if (!currentUser) {
      showToast("Please log in with Discord to upvote", "error");
      return;
    }

    fetch(API_BASE + "/api/configs/" + code + "/like", {
      method: "POST",
      headers: getAuthHeaders(),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) {
          showToast(data.error, "error");
          return;
        }
        var cardLike = document.getElementById("likes-" + code);
        if (cardLike) cardLike.textContent = data.likes;
        var btnLike = document.getElementById("btn-like-" + code);
        if (btnLike) {
          if (data.liked) btnLike.classList.add("liked");
          else btnLike.classList.remove("liked");
        }
        var detailLikes = document.getElementById("detail-likes-num");
        if (detailLikes) detailLikes.textContent = data.likes;
        var detailBtn = document.getElementById("btn-like-detail");
        if (detailBtn) {
          if (data.liked) detailBtn.classList.add("liked");
          else detailBtn.classList.remove("liked");
        }

        var cfg = allConfigs.find(function (c) {
          return c.share_code === code;
        });
        if (cfg) cfg.likes = data.likes;

        showToast(data.liked ? "Upvoted!" : "Upvote removed", "success");
      })
      .catch(function () {
        showToast("Upvote failed", "error");
      });
  };

  window.toggleDetailLike = function () {
    if (currentDetailConfig && currentDetailConfig.share_code) {
      window.toggleLike(currentDetailConfig.share_code);
    }
  };

  // ==========================================
  // FAVORITES MANAGEMENT
  // ==========================================

  function getFavorites() {
    try {
      var favs = localStorage.getItem("ch_favorites");
      return favs ? JSON.parse(favs) : [];
    } catch (e) {
      return [];
    }
  }

  function isFavorited(code) {
    if (!code) return false;
    var favs = getFavorites();
    return favs.indexOf(code) !== -1;
  }

  function updateFavoritesBadge() {
    var badge = document.getElementById("fav-count-badge");
    if (badge) {
      badge.textContent = getFavorites().length;
    }
  }

  window.toggleFavorite = function (code, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!code) return;

    var favs = getFavorites();
    var idx = favs.indexOf(code);
    var nowFav = false;

    if (idx !== -1) {
      favs.splice(idx, 1);
      nowFav = false;
      showToast("Removed from favorites", "info");
    } else {
      favs.push(code);
      nowFav = true;
      showToast("⭐ Added to favorites!", "success");
    }

    try {
      localStorage.setItem("ch_favorites", JSON.stringify(favs));
    } catch (err) {}

    updateFavoritesBadge();

    // Update all card buttons with this code
    var cardBtn = document.getElementById("btn-fav-" + code);
    if (cardBtn) {
      if (nowFav) {
        cardBtn.classList.add("favorited");
        cardBtn.innerHTML = '<i class="fas fa-star"></i>';
      } else {
        cardBtn.classList.remove("favorited");
        cardBtn.innerHTML = '<i class="far fa-star"></i>';
      }
    }

    // Update detail modal if open
    if (currentDetailConfig && currentDetailConfig.share_code === code) {
      var detailFavBtn = document.getElementById("btn-fav-detail");
      if (detailFavBtn) {
        if (nowFav) {
          detailFavBtn.classList.add("favorited");
          detailFavBtn.innerHTML = '<i class="fas fa-star"></i> <span>Favorited</span>';
        } else {
          detailFavBtn.classList.remove("favorited");
          detailFavBtn.innerHTML = '<i class="far fa-star"></i> <span>Favorite</span>';
        }
      }
    }

    if (currentFilter === "favorites") {
      filterAndRender();
    }
  };

  window.toggleDetailFavorite = function () {
    if (currentDetailConfig && currentDetailConfig.share_code) {
      window.toggleFavorite(currentDetailConfig.share_code);
    }
  };

  function parseAndPreviewZip(dataUri, callback) {
    try {
      if (typeof JSZip === "undefined") {
        callback("ZIP Archive (Download to extract files)");
        return;
      }
      var base64 = dataUri.split(",")[1];
      JSZip.loadAsync(base64, { base64: true }).then(function (zip) {
        var files = [];
        var firstFileText = "";
        var firstFileName = "";
        var promises = [];

        zip.forEach(function (relativePath, zipEntry) {
          if (!zipEntry.dir) {
            files.push(relativePath);
            if (!firstFileName && relativePath.match(/\.(txt|ini|cfg|json)$/i)) {
              firstFileName = relativePath;
              promises.push(
                zipEntry.async("string").then(function (content) {
                  firstFileText = content;
                })
              );
            }
          }
        });

        Promise.all(promises).then(function () {
          var out = "ZIP Archive (" + files.length + " file" + (files.length !== 1 ? "s" : "") + "):\n";
          files.forEach(function (f) {
            out += "  " + f + "\n";
          });
          if (firstFileName && firstFileText) {
            out += "\n--- Preview of " + firstFileName + " ---\n";
            var lines = firstFileText.split("\n");
            if (lines.length > 20) {
              out += lines.slice(0, 20).join("\n") + "\n... (" + lines.length + " lines)";
            } else {
              out += firstFileText;
            }
          }
          callback(out);
        }).catch(function () {
          callback("ZIP Archive (" + files.length + " files)");
        });
      }).catch(function () {
        callback("ZIP Archive");
      });
    } catch (e) {
      callback("ZIP Archive");
    }
  }

  window.downloadConfig = function () {
    if (!currentDetailConfig) return;

    // Increment download count via API
    fetch(
      API_BASE +
        "/api/configs/" +
        currentDetailConfig.share_code +
        "/download",
      { method: "POST" }
    ).catch(function () {});

    var content = currentDetailConfig.config_data || "";
    var sanitizedName = currentDetailConfig.name.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "config";

    if (content.startsWith("data:application/zip;base64,")) {
      // Binary ZIP download
      var base64 = content.split(",")[1];
      var binaryString = atob(base64);
      var bytes = new Uint8Array(binaryString.length);
      for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      var zipBlob = new Blob([bytes], { type: "application/zip" });
      var zipUrl = URL.createObjectURL(zipBlob);
      var a = document.createElement("a");
      a.href = zipUrl;
      a.download = sanitizedName + ".zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);
    } else {
      // Plain text config download
      var blob = new Blob([content], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = sanitizedName + ".txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    showToast("Config downloaded!", "success");
  };

  window.deleteConfig = function () {
    if (!currentDetailConfig || !currentUser) return;
    if (
      !confirm(
        'Delete "' + currentDetailConfig.name + '"? This cannot be undone.'
      )
    )
      return;

    fetch(API_BASE + "/api/configs/" + currentDetailConfig.share_code, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) {
          showToast("Delete failed: " + data.error, "error");
          return;
        }
        showToast("Config deleted", "success");
        closeModal("detail-modal");
        allConfigs = allConfigs.filter(function (c) {
          return c.share_code !== currentDetailConfig.share_code;
        });
        filterAndRender();
      })
      .catch(function () {
        showToast("Delete failed", "error");
      });
  };

  // ==========================================
  // UPLOAD & EDIT MODALS
  // ==========================================

  var GAME_MODES = {
    "Anime Expeditions": [
      "Story",
      "Raid",
      "Challenge",
      "Expedition",
      "Infinity Tower",
      "Event",
      "Boss Bounty",
      "Custom"
    ],
    "Anime Origins": [
      "Story",
      "Legend-Stages",
      "Raids",
      "Challenge",
      "Artifacts",
      "Rifts",
      "Custom"
    ]
  };

  function updateModeSuggestions(gameName) {
    var list = document.getElementById("mode-suggestions");
    if (!list) return;
    var modes = [];
    if (gameName && GAME_MODES[gameName]) {
      modes = GAME_MODES[gameName];
    } else {
      modes = [
        "Story",
        "Raid",
        "Challenge",
        "Expedition",
        "Infinity Tower",
        "Event",
        "Boss Bounty",
        "Legend-Stages",
        "Raids",
        "Artifacts",
        "Rifts",
        "Custom"
      ];
    }
    list.innerHTML = "";
    modes.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m;
      list.appendChild(opt);
    });
  }

  window.openUploadModal = function () {
    if (!currentUser) {
      showToast("Please log in to upload configs", "error");
      startDiscordLogin();
      return;
    }
    isEditing = false;
    editingConfigCode = null;
    resetUploadForm();
    updateModeSuggestions("Anime Expeditions");
    document.getElementById("upload-modal-title").textContent = "Upload Config";
    document.getElementById("upload-file-label").innerHTML = 'Config File(s) or ZIP <span class="required">*</span>';
    document.getElementById("btn-submit-text").textContent = "Upload Config";
    openModal("upload-modal");
  };

  window.openEditModal = function () {
    if (!currentDetailConfig) return;
    if (!currentUser || currentUser.id !== currentDetailConfig.author_id) {
      showToast("Only the original creator of this config can edit it.", "error");
      return;
    }

    isEditing = true;
    editingConfigCode = currentDetailConfig.share_code;

    closeModal("detail-modal");
    resetUploadForm();

    document.getElementById("upload-modal-title").textContent = "Edit Config (" + currentDetailConfig.share_code + ")";
    var gameVal = currentDetailConfig.game || "Anime Expeditions";
    document.getElementById("upload-game").value = gameVal;
    updateModeSuggestions(gameVal);
    document.getElementById("upload-name").value = currentDetailConfig.name || "";
    document.getElementById("upload-description").value = currentDetailConfig.description || "";
    document.getElementById("upload-mode").value = currentDetailConfig.mode || "";
    document.getElementById("upload-map").value = currentDetailConfig.map_name || "";
    
    try {
      uploadTags = currentDetailConfig.tags ? JSON.parse(currentDetailConfig.tags) : [];
      if (!Array.isArray(uploadTags)) uploadTags = [];
    } catch {
      uploadTags = [];
    }
    renderUploadTags();

    document.getElementById("upload-file-label").innerHTML = 'Replace File(s) or ZIP <span style="font-weight:normal;color:var(--text-3);font-size:0.75rem;">(Optional - leave empty to keep current file)</span>';
    document.getElementById("btn-submit-text").textContent = "Save Changes";
    document.getElementById("btn-submit").disabled = false;

    openModal("upload-modal");
  };

  function resetUploadForm() {
    document.getElementById("upload-form").reset();
    uploadTags = [];
    uploadFiles = [];
    renderUploadTags();
    document.getElementById("upload-file-preview-wrap").innerHTML = "";
    document.getElementById("upload-validation").classList.add("hidden");
    document.getElementById("btn-submit").disabled = !isEditing;

    // Populate role notice
    var notice = document.getElementById("upload-role-notice");
    if (notice && currentUser) {
      if (currentUser.is_admin) {
        notice.className = "upload-role-notice admin";
        notice.innerHTML = '<strong>Admin</strong> — Upload, edit, and moderation access enabled.';
      } else if (currentUser.is_config_maker || currentUser.is_creator) {
        notice.className = "upload-role-notice config-maker";
        notice.innerHTML = '<strong>Config Maker</strong> — Upload and edit access enabled.';
      } else if (currentUser.is_premium) {
        notice.className = "upload-role-notice premium";
        notice.innerHTML = '<strong>Donator</strong> — Upload and edit access enabled.';
      } else {
        notice.className = "upload-role-notice member";
        notice.innerHTML = '<strong>Donator Required</strong> — Uploading is reserved for Donators & Config Makers. <a href="https://discord.gg/cys" target="_blank" rel="noopener">discord.gg/cys</a>';
      }
    }
  }

  function initFileUpload() {
    var fileInput = document.getElementById("upload-file");
    var dropzone = document.getElementById("upload-dropzone");

    fileInput.addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        handleFilesSelected(Array.from(e.target.files));
      }
    });

    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", function () {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handleFilesSelected(Array.from(e.dataTransfer.files));
      }
    });
  }

  function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    var validation = document.getElementById("upload-validation");
    var previewWrap = document.getElementById("upload-file-preview-wrap");
    var totalSize = 0;

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var ext = "." + f.name.split(".").pop().toLowerCase();
      if (ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
        validation.className = "upload-validation invalid";
        validation.textContent = "Invalid file type: " + f.name + ". Allowed: " + ALLOWED_EXTENSIONS.join(", ");
        validation.classList.remove("hidden");
        uploadFiles = [];
        updateSubmitButton();
        return;
      }
      totalSize += f.size;
    }

    if (totalSize > MAX_FILE_SIZE) {
      validation.className = "upload-validation invalid";
      validation.textContent = "Total size too large (" + formatFileSize(totalSize) + "). Max limit is " + formatFileSize(MAX_FILE_SIZE);
      validation.classList.remove("hidden");
      uploadFiles = [];
      updateSubmitButton();
      return;
    }

    uploadFiles = files;

    if (files.length === 1) {
      previewWrap.innerHTML =
        '<div class="upload-file-preview">' +
        '<span class="file-name"><i class="fas fa-file-alt"></i> ' + escapeHtml(files[0].name) + '</span>' +
        '<span class="file-size">' + formatFileSize(files[0].size) + '</span>' +
        '<button type="button" class="file-remove" onclick="removeUploadFiles()">✕</button>' +
        '</div>';
      validation.className = "upload-validation valid";
      validation.textContent = "1 file ready for upload";
      validation.classList.remove("hidden");
    } else {
      var fileNames = files.map(function (f) { return f.name; }).join(", ");
      if (fileNames.length > 55) fileNames = fileNames.substring(0, 52) + "...";
      previewWrap.innerHTML =
        '<div class="upload-file-preview">' +
        '<span class="file-name"><i class="fas fa-archive"></i> ' + files.length + ' files selected (' + escapeHtml(fileNames) + ')</span>' +
        '<span class="file-size">' + formatFileSize(totalSize) + '</span>' +
        '<button type="button" class="file-remove" onclick="removeUploadFiles()">✕</button>' +
        '</div>';
      validation.className = "upload-validation valid";
      validation.textContent = files.length + " files ready (packaged as ZIP)";
      validation.classList.remove("hidden");
    }

    updateSubmitButton();
  }

  window.removeUploadFiles = function () {
    uploadFiles = [];
    document.getElementById("upload-file").value = "";
    document.getElementById("upload-file-preview-wrap").innerHTML = "";
    document.getElementById("upload-validation").classList.add("hidden");
    updateSubmitButton();
  };

  function updateSubmitButton() {
    var game = (document.getElementById("upload-game").value || "").trim();
    var name = (document.getElementById("upload-name").value || "").trim();
    if (isEditing) {
      document.getElementById("btn-submit").disabled = !game || !name;
    } else {
      document.getElementById("btn-submit").disabled = !game || !name || uploadFiles.length === 0;
    }
  }

  // Listen for input changes to update submit button
  document.addEventListener("input", function (e) {
    if (e.target.id === "upload-game" || e.target.id === "upload-name") {
      updateSubmitButton();
      if (e.target.id === "upload-game") {
        updateModeSuggestions(e.target.value.trim());
      }
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "upload-game") {
      updateSubmitButton();
      updateModeSuggestions(e.target.value.trim());
    }
  });

  // Tags input
  function initTagsInput() {
    var input = document.getElementById("tags-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        var tag = input.value.trim().replace(/,/g, "");
        if (tag && uploadTags.length < 5 && uploadTags.indexOf(tag) === -1) {
          uploadTags.push(tag);
          renderUploadTags();
        }
        input.value = "";
      } else if (
        e.key === "Backspace" &&
        !input.value &&
        uploadTags.length > 0
      ) {
        uploadTags.pop();
        renderUploadTags();
      }
    });
  }

  function renderUploadTags() {
    var wrap = document.getElementById("tags-wrap");
    var input = document.getElementById("tags-input");
    // Remove existing tag items
    wrap.querySelectorAll(".tag-item").forEach(function (el) {
      el.remove();
    });
    // Add tag items before input
    uploadTags.forEach(function (tag, i) {
      var el = document.createElement("span");
      el.className = "tag-item";
      el.innerHTML =
        escapeHtml(tag) +
        ' <button type="button" onclick="removeUploadTag(' +
        i +
        ')">×</button>';
      wrap.insertBefore(el, input);
    });
  }

  window.removeUploadTag = function (index) {
    uploadTags.splice(index, 1);
    renderUploadTags();
  };

  // Submit (Handles both Create & Edit)
  window.submitConfig = function (e) {
    e.preventDefault();

    if (!currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    var game = (document.getElementById("upload-game").value || "Anime Expeditions").trim();
    var name = (document.getElementById("upload-name").value || "").trim();
    var description = (document.getElementById("upload-description").value || "").trim();
    var mode = (document.getElementById("upload-mode").value || "General").trim();
    var mapName = (document.getElementById("upload-map").value || "").trim();

    if (!game || !name) {
      showToast("Please fill in Game and Config Name", "error");
      return;
    }

    if (!isEditing && uploadFiles.length === 0) {
      showToast("Please select at least one configuration file", "error");
      return;
    }

    var submitBtn = document.getElementById("btn-submit");
    var submitText = document.getElementById("btn-submit-text");
    submitBtn.disabled = true;
    if (submitText) submitText.textContent = isEditing ? "Saving Changes..." : "Scanning & Uploading...";

    var onProcessed = function (result) {
      if (result && !result.safe) {
        showToast("Upload rejected: " + result.reason, "error");
        submitBtn.disabled = false;
        if (submitText) submitText.textContent = isEditing ? "Save Changes" : "Upload Config";
        return;
      }

      var payload = {
        game: game,
        name: name,
        description: description,
        mode: mode,
        map_name: mapName,
        tags: JSON.stringify(uploadTags),
      };

      if (result && result.configData) {
        payload.config_data = result.configData;
        payload.file_count = result.fileCount || 1;
      }

      var url = isEditing ? (API_BASE + "/api/configs/" + editingConfigCode) : (API_BASE + "/api/configs");
      var method = isEditing ? "PUT" : "POST";

      fetch(url, {
        method: method,
        headers: Object.assign({ "Content-Type": "application/json" }, getAuthHeaders()),
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (data.error) {
            showToast("Failed: " + data.error, "error");
            submitBtn.disabled = false;
            if (submitText) submitText.textContent = isEditing ? "Save Changes" : "Upload Config";
            return;
          }
          showToast(
            isEditing ? "Config updated successfully!" : ("Config uploaded! Share code: " + data.share_code),
            "success"
          );
          closeModal("upload-modal");
          loadConfigs();
          submitBtn.disabled = false;
          if (submitText) submitText.textContent = isEditing ? "Save Changes" : "Upload Config";
        })
        .catch(function (err) {
          showToast("Operation failed. Please check backend connection.", "error");
          submitBtn.disabled = false;
          if (submitText) submitText.textContent = isEditing ? "Save Changes" : "Upload Config";
        });
    };

    if (uploadFiles.length > 0) {
      processFilesForUpload(uploadFiles, onProcessed);
    } else if (isEditing) {
      // Editing metadata only without replacing file
      onProcessed(null);
    }
  };

  // ==========================================
  // MULTI-FILE PROCESSOR & MALWARE SCANNER
  // ==========================================

  function processFilesForUpload(files, callback) {
    if (!files || files.length === 0) {
      callback({ safe: false, reason: "No files selected." });
      return;
    }

    // MULTIPLE FILES: Automatically bundle into a clean ZIP archive
    if (files.length > 1) {
      if (typeof JSZip === "undefined") {
        callback({ safe: false, reason: "JSZip library not loaded. Please refresh the page." });
        return;
      }

      var zip = new JSZip();
      var allowedExtensions = [".txt", ".json", ".ini", ".cfg"];
      var readPromises = [];

      for (var i = 0; i < files.length; i++) {
        (function (f) {
          var ext = "." + f.name.split(".").pop().toLowerCase();
          if (allowedExtensions.indexOf(ext) === -1) {
            callback({ safe: false, reason: 'Invalid file "' + f.name + '". Only text configuration files (.txt, .json, .ini, .cfg) can be multi-bundled.' });
            return;
          }

          var p = new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
              var text = ev.target.result;
              var scan = scanForMalware(text);
              if (!scan.safe) {
                reject(new Error('Dangerous content in "' + f.name + '": ' + scan.reason));
                return;
              }
              zip.file(f.name, text);
              resolve();
            };
            reader.onerror = function () {
              reject(new Error('Failed to read "' + f.name + '"'));
            };
            reader.readAsText(f);
          });
          readPromises.push(p);
        })(files[i]);
      }

      Promise.all(readPromises).then(function () {
        zip.generateAsync({ type: "base64", compression: "DEFLATE" }).then(function (b64) {
          var dataUri = "data:application/zip;base64," + b64;
          callback({
            safe: true,
            configData: dataUri,
            fileCount: files.length,
            isZip: true
          });
        }).catch(function (err) {
          callback({ safe: false, reason: "Failed to create ZIP package: " + err.message });
        });
      }).catch(function (err) {
        callback({ safe: false, reason: err.message });
      });

      return;
    }

    // SINGLE FILE
    var file = files[0];
    var isZip = file.name.toLowerCase().endsWith(".zip");

    if (isZip) {
      if (typeof JSZip === "undefined") {
        callback({ safe: false, reason: "JSZip library not loaded. Please refresh the page." });
        return;
      }

      var reader = new FileReader();
      reader.onload = function (ev) {
        var buffer = ev.target.result;
        JSZip.loadAsync(buffer).then(function (zip) {
          var fileCount = 0;
          var totalSize = 0;
          var entries = [];

          zip.forEach(function (path, entry) {
            if (!entry.dir) {
              fileCount++;
              entries.push({ path: path, entry: entry });
            }
          });

          if (fileCount === 0) {
            callback({ safe: false, reason: "The uploaded ZIP archive is empty." });
            return;
          }

          var allowedExtensions = [".txt", ".json", ".ini", ".cfg"];
          var promises = [];

          for (var i = 0; i < entries.length; i++) {
            var path = entries[i].path;
            var entry = entries[i].entry;
            var ext = "." + path.split(".").pop().toLowerCase();

            if (allowedExtensions.indexOf(ext) === -1) {
              callback({
                safe: false,
                reason: 'Disallowed file "' + path + '" found in ZIP. Only .txt, .json, .ini, and .cfg configuration files are permitted.'
              });
              return;
            }

            (function (p, ent) {
              promises.push(
                ent.async("uint8array").then(function (bytes) {
                  totalSize += bytes.length;
                  if (totalSize > 10 * 1024 * 1024) {
                    throw new Error("Uncompressed ZIP size exceeds 10MB limit.");
                  }
                  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
                    throw new Error('Executable binary header (MZ) detected in "' + p + '"');
                  }
                  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
                    throw new Error('Linux binary header (ELF) detected in "' + p + '"');
                  }
                  var decoder = new TextDecoder("utf-8");
                  var text = decoder.decode(bytes);
                  var scan = scanForMalware(text);
                  if (!scan.safe) {
                    throw new Error('Dangerous content in "' + p + '": ' + scan.reason);
                  }
                })
              );
            })(path, entry);
          }

          Promise.all(promises)
            .then(function () {
              var base64Reader = new FileReader();
              base64Reader.onload = function (bEv) {
                callback({
                  safe: true,
                  configData: bEv.target.result,
                  fileCount: fileCount,
                  isZip: true
                });
              };
              base64Reader.readAsDataURL(file);
            })
            .catch(function (err) {
              callback({ safe: false, reason: err.message });
            });
        }).catch(function () {
          callback({ safe: false, reason: "Corrupted or invalid ZIP file." });
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Plain text file (.txt, .json, .ini, .cfg)
      var textReader = new FileReader();
      textReader.onload = function (ev) {
        var text = ev.target.result;
        var scan = scanForMalware(text);
        if (!scan.safe) {
          callback({ safe: false, reason: scan.reason });
          return;
        }
        callback({
          safe: true,
          configData: text,
          fileCount: 1
        });
      };
      textReader.onerror = function () {
        callback({ safe: false, reason: "Failed to read file." });
      };
      textReader.readAsText(file);
    }
  }

  function scanForMalware(content) {
    if (!content || typeof content !== "string") {
      return { safe: false, reason: "Empty or invalid content" };
    }

    // Check for executable signatures
    if (content.substring(0, 2) === "MZ" || content.substring(0, 4) === "\x7fELF") {
      return { safe: false, reason: "Executable binary detected" };
    }

    var dangerousPatterns = [
      { pattern: /powershell\s*[\-\/].*(?:exec|bypass|encoded|hidden)/i, reason: "PowerShell execution attempt" },
      { pattern: /cmd\s*\/[ck]\s/i, reason: "Command prompt execution" },
      { pattern: /wscript\.shell/i, reason: "WScript Shell execution" },
      { pattern: /CreateObject\s*\(\s*["']WScript/i, reason: "VBScript CreateObject" },
      { pattern: /\bRegDelete\b|\bRegWrite\b/i, reason: "Registry tampering" },
      { pattern: /discord(?:app)?\.com\/api\/webhooks\/\d{17,23}\//i, reason: "Discord webhook grabber" },
      { pattern: /eval\s*\(\s*atob\s*\(/i, reason: "Obfuscated payload execution" },
      { pattern: /document\.cookie/i, reason: "Cookie theft attempt" },
      { pattern: /localStorage\.\w*[Tt]oken/i, reason: "Token theft attempt" },
      { pattern: /\bInvoke-WebRequest\b/i, reason: "Remote download script" },
      { pattern: /\bInvoke-Expression\b/i, reason: "Expression execution" },
      { pattern: /\bcertutil\b.*\-decode/i, reason: "Certutil payload decoder" },
      { pattern: /\bbitsadmin\b/i, reason: "Bitsadmin downloader" },
      { pattern: /\bmshta\b/i, reason: "MSHTA script executor" },
      { pattern: /\brundll32\b/i, reason: "RunDLL32 execution" },
      { pattern: /<script[\s>]/i, reason: "HTML script injection" }
    ];

    for (var i = 0; i < dangerousPatterns.length; i++) {
      if (dangerousPatterns[i].pattern.test(content)) {
        return {
          safe: false,
          reason: dangerousPatterns[i].reason
        };
      }
    }

    return { safe: true };
  }

  // ==========================================
  // MODAL SYSTEM
  // ==========================================

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("visible");
    modal.classList.add("active");
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("visible");
    modal.classList.remove("active");
    modal.style.display = "none";
    document.body.style.overflow = "";
  };

  // Close modal on backdrop click
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("visible");
      e.target.classList.remove("active");
      e.target.style.display = "none";
      macroModalOpen = false;
      document.body.style.overflow = "";
    }
  });

  // Close modal on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".modal-overlay")
        .forEach(function (m) {
          m.classList.remove("visible");
          m.classList.remove("active");
          m.style.display = "none";
        });
      macroModalOpen = false;
      document.body.style.overflow = "";
    }
  });

  // ==========================================
  // MOBILE NAV
  // ==========================================

  function initMobileNav() {
    var toggle = document.getElementById("nav-toggle");
    var links = document.getElementById("nav-links");
    toggle.addEventListener("click", function () {
      links.classList.toggle("mobile-open");
    });
  }

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================

  function showToast(message, type) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function showSpinner(show) {
    var spinner = document.getElementById("configs-spinner");
    if (show) {
      spinner.classList.remove("hidden");
    } else {
      spinner.classList.add("hidden");
    }
  }

  function showEmpty(show) {
    var empty = document.getElementById("empty-state");
    if (show) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
    }
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  function formatNumber(n) {
    n = parseInt(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toString();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    var d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return "";
    var date = new Date(isoString);
    var now = new Date();
    var diffSec = Math.floor((now - date) / 1000);

    if (isNaN(diffSec) || diffSec < 0) return "just now";
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return Math.floor(diffSec / 60) + "m ago";
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + "h ago";
    if (diffSec < 604800) return Math.floor(diffSec / 86400) + "d ago";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function isEdited(created_at, updated_at) {
    if (!updated_at) return false;
    if (!created_at) return true;
    var c = new Date(created_at).getTime();
    var u = new Date(updated_at).getTime();
    return !isNaN(u) && !isNaN(c) && (u - c > 60000);
  }

  // ==========================================
  // CYSLINK MACRO REMOTE & INTEGRATION
  // ==========================================

  var MACRO_TESTER_GUILD_ID = "1391118743035183155";
  var isMacroTester = false;

  function checkMacroTesterAccess() {
    var remoteBtn = document.getElementById("btn-macro-remote");
    if (!currentUser) {
      isMacroTester = false;
      if (remoteBtn) remoteBtn.classList.add("hidden");
      if (macroModalOpen) window.closeMacroRemoteModal();
      return Promise.resolve(false);
    }

    var isOwnerOrAdmin = currentUser.id === "1141849395902554202" || !!currentUser.is_owner || !!currentUser.is_admin;
    if (isOwnerOrAdmin || currentUser.is_macro_tester === true) {
      isMacroTester = true;
      if (remoteBtn) remoteBtn.classList.remove("hidden");
      return Promise.resolve(true);
    }

    return fetch(CYSLINK_API + "/api/v1/website/user/" + encodeURIComponent(currentUser.id) + "/tester")
      .then(function (res) {
        if (!res.ok) return { is_tester: false };
        return res.json();
      })
      .then(function (data) {
        if (data && data.is_tester) {
          isMacroTester = true;
          currentUser.is_macro_tester = true;
          localStorage.setItem("ch_user", JSON.stringify(currentUser));
          if (remoteBtn) remoteBtn.classList.remove("hidden");
          return true;
        } else {
          isMacroTester = false;
          if (remoteBtn) remoteBtn.classList.add("hidden");
          if (macroModalOpen) window.closeMacroRemoteModal();
          return false;
        }
      })
      .catch(function () {
        if (currentUser.is_macro_tester) {
          isMacroTester = true;
          if (remoteBtn) remoteBtn.classList.remove("hidden");
          return true;
        }
        isMacroTester = false;
        if (remoteBtn) remoteBtn.classList.add("hidden");
        return false;
      });
  }

  function initMacroRemote() {
    checkMacroTesterAccess().then(function (allowed) {
      if (allowed) {
        var savedDevId = localStorage.getItem("cyslink_device_id");
        if (savedDevId) {
          fetchMacroStatus(savedDevId);
        } else {
          syncUserMacroDevices(false);
        }
      }
    });

    // Explicit navbar remote button listener
    var remoteBtn = document.getElementById("btn-macro-remote");
    if (remoteBtn) {
      remoteBtn.addEventListener("click", function (e) {
        e.preventDefault();
        window.openMacroRemoteModal();
      });
    }

    // Enter key shortcuts for pairing and share code quick injection
    var pairInput = document.getElementById("macro-pair-code-input");
    if (pairInput) {
      pairInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          window.submitPairCode();
        }
      });
    }

    var injectInput = document.getElementById("macro-inject-code");
    if (injectInput) {
      injectInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          window.submitInjectCode();
        }
      });
    }

    if (macroPollTimer) clearInterval(macroPollTimer);
    macroPollTimer = setInterval(function () {
      if (!isMacroTester) return;
      if (activeMacroDevice && activeMacroDevice.device_id) {
        fetchMacroStatus(activeMacroDevice.device_id, false);
      } else {
        syncUserMacroDevices(false);
      }
    }, 10000);
  }

  // ==========================================
  // CYSLINK SECURITY & DEBUG TELEMETRY
  // ==========================================

  function logMacroSecurity(msg, level) {
    var prefix = "[CysLink Security]";
    var timeStr = new Date().toLocaleTimeString();
    var formatted = "[" + timeStr + "] " + msg;
    if (level === "warn") {
      console.warn(prefix, msg);
    } else if (level === "error") {
      console.error(prefix, msg);
    } else {
      console.log(prefix, msg);
    }
    var logBox = document.getElementById("macro-sec-log-box");
    if (logBox) {
      var div = document.createElement("div");
      div.className = "sec-log-entry" + (level ? " " + level : "");
      div.textContent = formatted;
      logBox.appendChild(div);
      logBox.scrollTop = logBox.scrollHeight;
    }
  }

  window.clearMacroSecurityLog = function () {
    var logBox = document.getElementById("macro-sec-log-box");
    if (logBox) logBox.innerHTML = '<div class="sec-log-entry">[DEBUG] Log cleared.</div>';
  };

  window.toggleMacroSecurityPanel = function () {
    var panel = document.getElementById("macro-security-panel");
    var btn = document.getElementById("macro-btn-security");
    if (!panel) return;
    var isHidden = panel.classList.contains("hidden");
    if (isHidden) {
      panel.classList.remove("hidden");
      if (btn) btn.classList.add("active");
      renderMacroSecurityPanel();
    } else {
      panel.classList.add("hidden");
      if (btn) btn.classList.remove("active");
    }
  };

  function renderMacroSecurityPanel() {
    var uidEl = document.getElementById("sec-stat-user-id");
    var activeEl = document.getElementById("sec-stat-active-device");
    var ipEl = document.getElementById("sec-stat-device-ip");
    var countEl = document.getElementById("sec-device-count");
    var listEl = document.getElementById("macro-sec-device-list");

    if (uidEl) uidEl.textContent = currentUser && currentUser.id ? (currentUser.username || "User") + " (" + currentUser.id + ")" : "Not logged in";
    if (activeEl) {
      if (activeMacroDevice) {
        var aId = activeMacroDevice.device_id || "";
        activeEl.textContent = (activeMacroDevice.name || "Device") + " (" + (aId.length > 8 ? aId.substring(0, 8) : aId) + ")";
      } else {
        activeEl.textContent = "None";
      }
    }
    if (ipEl) {
      ipEl.textContent = (activeMacroDevice && activeMacroDevice.client_ip) ? activeMacroDevice.client_ip : "Unknown";
    }
    if (countEl) countEl.textContent = String(userMacroDevicesList.length);

    if (listEl) {
      if (!userMacroDevicesList.length) {
        listEl.innerHTML = '<div class="macro-sec-empty">No devices linked to your Discord account.</div>';
        return;
      }
      var html = "";
      userMacroDevicesList.forEach(function (d) {
        var isCurrent = activeMacroDevice && activeMacroDevice.device_id === d.device_id;
        var statusBadge = d.online ? '<span class="macro-state-badge online" style="font-size:0.6rem;padding:0.1rem 0.4rem;">Online</span>' : '<span class="macro-state-badge offline" style="font-size:0.6rem;padding:0.1rem 0.4rem;">Offline</span>';
        var devIdShort = d.device_id ? d.device_id.substring(0, 8) + "..." : "----";
        var ipStr = d.client_ip || "Unknown IP";
        var pingStr = d.online ? (d.last_seen_seconds_ago < 5 ? "Active now" : d.last_seen_seconds_ago + "s ago") : "Offline";

        html += '<div class="macro-sec-device-item' + (isCurrent ? ' active-dev' : '') + '">';
        html += '  <div class="sec-dev-info">';
        html += '    <div class="sec-dev-name-row">';
        html += '      <span class="sec-dev-title">' + escapeHtml(d.name || "Macro-PC") + '</span>';
        html += '      ' + statusBadge;
        if (isCurrent) html += ' <span style="font-size:0.65rem;color:var(--prim);font-weight:700;">(ACTIVE)</span>';
        html += '    </div>';
        html += '    <div class="sec-dev-meta">ID: ' + devIdShort + ' | IP: ' + escapeHtml(ipStr) + ' | ' + pingStr + '</div>';
        html += '  </div>';
        html += '  <div class="sec-dev-actions">';
        if (!isCurrent) {
          html += '    <button class="btn-sec-select-dev" onclick="switchMacroDevice(\'' + d.device_id + '\')">Select</button>';
        }
        html += '    <button class="btn-sec-unlink-dev" onclick="unlinkDeviceById(\'' + d.device_id + '\')" title="Unlink this device">Unlink</button>';
        html += '  </div>';
        html += '</div>';
      });
      listEl.innerHTML = html;
    }
  }

  function updateMacroDevicePickerUI() {
    var picker = document.getElementById("macro-device-picker");
    var nameEl = document.getElementById("macro-modal-device-name");
    if (!picker) return;

    if (!userMacroDevicesList || userMacroDevicesList.length <= 1) {
      picker.classList.add("hidden");
      if (nameEl) nameEl.classList.remove("hidden");
      return;
    }

    if (nameEl) nameEl.classList.add("hidden");
    picker.classList.remove("hidden");

    var currentId = activeMacroDevice ? activeMacroDevice.device_id : "";
    var html = "";
    userMacroDevicesList.forEach(function (d) {
      var sel = d.device_id === currentId ? " selected" : "";
      var label = (d.name || "Macro-PC") + (d.online ? " [Online]" : " [Offline]");
      html += '<option value="' + d.device_id + '"' + sel + '>' + escapeHtml(label) + '</option>';
    });
    picker.innerHTML = html;
  }

  window.onMacroDevicePickerChange = function (newDevId) {
    window.switchMacroDevice(newDevId);
  };

  window.switchMacroDevice = function (deviceId) {
    var found = userMacroDevicesList.find(function (d) { return d.device_id === deviceId; });
    if (!found) {
      logMacroSecurity("Device switch rejected: " + deviceId + " not in authorized device list!", "warn");
      return;
    }
    activeMacroDevice = found;
    localStorage.setItem("cyslink_device_id", found.device_id);
    logMacroSecurity("Switched active device to " + (found.name || "Device") + " (" + found.device_id.substring(0, 8) + ") | IP: " + (found.client_ip || "Unknown"));
    updateMacroNavBadge();
    updateMacroDevicePickerUI();
    renderMacroSecurityPanel();
    renderMacroDashboard();
    fetchMacroStatus(found.device_id, true);
    showToast("Switched to " + (found.name || "Macro-PC"), "info");
  };

  function syncUserMacroDevices(notifyOnFind) {
    if (!currentUser || !currentUser.id) {
      activeMacroDevice = null;
      userMacroDevicesList = [];
      updateMacroNavBadge();
      updateMacroDevicePickerUI();
      if (macroModalOpen) renderMacroPairingCard();
      return;
    }

    var primaryUrl = CYSLINK_API + "/api/v1/website/user/" + encodeURIComponent(currentUser.id) + "/devices";
    logMacroSecurity("Syncing devices for Discord user " + currentUser.id + " (" + (currentUser.username || "User") + ")...");

    fetch(primaryUrl)
      .then(function (res) {
        if (!res.ok) {
          logMacroSecurity("User devices query returned HTTP " + res.status, "warn");
          return [];
        }
        return res.json();
      })
      .then(function (devs) {
        if (!Array.isArray(devs)) devs = [];

        // Strictly only accept devices that belong to this Discord user
        userMacroDevicesList = devs.filter(function (d) {
          return !d.discord_user_id || String(d.discord_user_id) === String(currentUser.id);
        });

        logMacroSecurity("Retrieved " + userMacroDevicesList.length + " device(s) linked to user ID " + currentUser.id);

        renderMacroSecurityPanel();
        updateMacroDevicePickerUI();

        if (userMacroDevicesList.length > 0) {
          var savedDevId = localStorage.getItem("cyslink_device_id");
          var matched = null;

          if (savedDevId) {
            matched = userMacroDevicesList.find(function (d) { return d.device_id === savedDevId; });
          }

          if (matched) {
            // Keep user's chosen device! NEVER silently switch away!
            logMacroSecurity("Preserved user's selected device: " + (matched.name || "Macro-PC") + " (" + matched.device_id.substring(0, 8) + ")");
            activeMacroDevice = matched;
          } else {
            // If previous choice was invalid/unlinked, pick the best online device
            var onlineDevs = userMacroDevicesList.filter(function (d) { return d.online; });
            var best = onlineDevs.length > 0 ? onlineDevs[0] : userMacroDevicesList[0];
            activeMacroDevice = best;
            localStorage.setItem("cyslink_device_id", best.device_id);
            logMacroSecurity("Selected device " + (best.name || "Macro-PC") + " (" + best.device_id.substring(0, 8) + ") | IP: " + (best.client_ip || "Unknown"));
          }

          updateMacroNavBadge();
          if (macroModalOpen) renderMacroDashboard();
          if (notifyOnFind) {
            showToast("Connected to " + (activeMacroDevice.name || "Macro-PC") + (activeMacroDevice.online ? " (Online)" : " (Offline)"), activeMacroDevice.online ? "success" : "info");
          }
          return;
        }

        // Zero linked devices for this user
        activeMacroDevice = null;
        localStorage.removeItem("cyslink_device_id");
        updateMacroNavBadge();
        if (macroModalOpen) {
          renderMacroPairingCard();
        }
        if (notifyOnFind) {
          showToast("No macro linked to your Discord account. Press F6 in macro to link.", "info");
        }
      })
      .catch(function (err) {
        logMacroSecurity("Sync devices error: " + (err.message || err), "error");
        updateMacroNavBadge();
        if (notifyOnFind) {
          showToast("Unable to reach CysLink relay server.", "error");
        }
      });
  }

  window.detectMacroDevice = function (showToastFeedback) {
    syncUserMacroDevices(showToastFeedback !== false);
  };

  var macroStatusConsecutiveErrors = 0;

  function fetchMacroStatus(deviceId, updateDashboardUi) {
    if (!deviceId) return;
    var uidParam = currentUser && currentUser.id ? "?discord_user_id=" + encodeURIComponent(currentUser.id) : "";
    fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(deviceId) + "/status" + uidParam)
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 403) {
            logMacroSecurity("SECURITY ALERT: Forbidden status access on device " + deviceId + " by user " + (currentUser ? currentUser.id : "null"), "error");
            localStorage.removeItem("cyslink_device_id");
            activeMacroDevice = null;
            updateMacroNavBadge();
            if (macroModalOpen) renderMacroPairingCard();
            throw new Error("Unauthorized device access");
          }
          throw new Error("Device not found (HTTP " + res.status + ")");
        }
        return res.json();
      })
      .then(function (data) {
        // STRICT SECURITY CHECK: verify device ownership!
        if (currentUser && currentUser.id && data.discord_user_id && String(data.discord_user_id) !== String(currentUser.id)) {
          var isOwner = currentUser.id === "1141849395902554202" || currentUser.is_owner;
          if (!isOwner) {
            logMacroSecurity("SECURITY WARNING: Device " + data.device_id + " belongs to user " + data.discord_user_id + ", NOT current user " + currentUser.id + "! Dropping connection.", "error");
            localStorage.removeItem("cyslink_device_id");
            activeMacroDevice = null;
            updateMacroNavBadge();
            if (macroModalOpen) renderMacroPairingCard();
            return;
          }
        }

        macroStatusConsecutiveErrors = 0;
        activeMacroDevice = data;
        updateMacroNavBadge();
        updateMacroDevicePickerUI();
        renderMacroSecurityPanel();
        if (macroModalOpen || updateDashboardUi) {
          renderMacroDashboard();
        }
      })
      .catch(function (err) {
        macroStatusConsecutiveErrors++;
        logMacroSecurity("Status fetch failed (" + macroStatusConsecutiveErrors + "/3): " + (err.message || err), "warn");
        if (macroStatusConsecutiveErrors >= 3) {
          if (activeMacroDevice) {
            activeMacroDevice.online = false;
          }
          updateMacroNavBadge();
          if (macroModalOpen) {
            if (activeMacroDevice) {
              renderMacroDashboard();
            } else {
              renderMacroPairingCard();
            }
          }
          syncUserMacroDevices(false);
        }
      });
  }

  function updateMacroNavBadge() {
    var dot = document.getElementById("macro-status-dot");
    var lbl = document.getElementById("macro-status-label");
    if (!dot || !lbl) return;

    dot.className = "macro-dot";
    if (!activeMacroDevice) {
      dot.classList.add("offline");
      lbl.textContent = "Connect Macro";
      return;
    }

    if (!activeMacroDevice.online) {
      dot.classList.add("offline");
      lbl.textContent = "Macro Offline";
      return;
    }

    var st = activeMacroDevice.status || {};
    if (st.is_paused) {
      dot.classList.add("paused");
      lbl.textContent = "Paused";
    } else if (st.is_running) {
      dot.classList.add("online");
      lbl.textContent = "Running";
    } else {
      dot.classList.add("online");
      lbl.textContent = "Macro Online";
    }
  }

  window.openMacroRemoteModal = function () {
    var isOwnerOrAdmin = currentUser && (currentUser.id === "1141849395902554202" || currentUser.is_owner || currentUser.is_admin);
    if (!isMacroTester && !isOwnerOrAdmin && (!currentUser || !currentUser.is_macro_tester)) {
      showToast("Macro remote control is in testing for server members only.", "error");
      return;
    }
    var modal = document.getElementById("macro-remote-modal");
    if (!modal) return;
    macroModalOpen = true;
    modal.classList.add("visible");
    modal.classList.add("active");
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    if (activeMacroDevice && activeMacroDevice.device_id) {
      renderMacroDashboard();
      fetchMacroStatus(activeMacroDevice.device_id, true);
    } else {
      renderMacroPairingCard();
      syncUserMacroDevices(false);
    }
  };

  window.closeMacroRemoteModal = function () {
    var modal = document.getElementById("macro-remote-modal");
    if (!modal) return;
    macroModalOpen = false;
    modal.classList.remove("visible");
    modal.classList.remove("active");
    modal.style.display = "none";
    document.body.style.overflow = "";
  };

  function renderMacroPairingCard() {
    var pairCard = document.getElementById("macro-pair-card");
    var dash = document.getElementById("macro-dashboard");
    var nameEl = document.getElementById("macro-modal-device-name");
    var stateBadge = document.getElementById("macro-modal-state-badge");

    if (pairCard) pairCard.classList.remove("hidden");
    if (dash) dash.classList.add("hidden");
    if (nameEl) nameEl.textContent = "No Device Connected";
    if (stateBadge) {
      stateBadge.className = "macro-state-badge offline";
      stateBadge.textContent = "Offline";
    }
  }

  function renderMacroDashboard() {
    var pairCard = document.getElementById("macro-pair-card");
    var dash = document.getElementById("macro-dashboard");
    var nameEl = document.getElementById("macro-modal-device-name");
    var stateBadge = document.getElementById("macro-modal-state-badge");

    if (!activeMacroDevice) {
      renderMacroPairingCard();
      return;
    }

    if (pairCard) pairCard.classList.add("hidden");
    if (dash) dash.classList.remove("hidden");

    var dev = activeMacroDevice;
    var st = dev.status || {};

    if (nameEl) {
      nameEl.textContent = (dev.name || "Macro-PC") + " (" + (dev.macro_type || "Anime Expeditions") + ")";
    }

    if (stateBadge) {
      stateBadge.className = "macro-state-badge";
      if (!dev.online) {
        stateBadge.classList.add("offline");
        stateBadge.textContent = "Offline";
      } else if (st.is_paused) {
        stateBadge.classList.add("paused");
        stateBadge.textContent = "Paused";
      } else if (st.is_running) {
        stateBadge.classList.add("running");
        stateBadge.textContent = "Running";
      } else {
        stateBadge.classList.add("idle");
        stateBadge.textContent = "Idle";
      }
    }

    var telemState = document.getElementById("macro-telem-state");
    var telemMode = document.getElementById("macro-telem-mode");
    var telemTeam = document.getElementById("macro-telem-team");
    var telemUptime = document.getElementById("macro-telem-uptime");
    var telemPing = document.getElementById("macro-telem-ping");

    if (telemState) telemState.textContent = !dev.online ? "Offline" : (st.state || (st.is_paused ? "Paused" : (st.is_running ? "Running" : "Idle")));
    if (telemMode) {
      var modeStr = st.mode || "None";
      if (st.stage && st.stage !== "None") modeStr += " • " + st.stage;
      if (st.act && st.act !== "None") modeStr += " (" + st.act + ")";
      telemMode.textContent = modeStr;
    }
    if (telemTeam) {
      var displayTeam = st.team || "No Team";
      if (displayTeam === "Skip Team" || displayTeam === "None" || displayTeam === "0") {
        displayTeam = "No Team";
      }
      telemTeam.textContent = displayTeam;
    }

    var teamDropdown = document.getElementById("macro-team-dropdown");
    if (teamDropdown && !teamDropdown.matches(":focus") && st.team) {
      var tLower = String(st.team).toLowerCase();
      if (tLower.includes("skip") || tLower.includes("none") || tLower === "0") {
        teamDropdown.value = "none";
        activeMacroTeam = "none";
      } else {
        var tNum = tLower.replace(/[^\d]/g, "");
        if (tNum && teamDropdown.querySelector('option[value="' + tNum + '"]')) {
          teamDropdown.value = tNum;
          activeMacroTeam = tNum;
        }
      }
    }
    if (telemUptime) telemUptime.textContent = st.uptime || "0s";
    if (telemPing) {
      var sec = dev.last_seen_seconds_ago || 0;
      telemPing.textContent = !dev.online ? "Offline" : (sec < 5 ? "Just now" : sec + "s ago");
    }

    var pauseText = document.getElementById("macro-pause-text");
    var pauseIcon = document.getElementById("macro-pause-icon");
    if (pauseText && pauseIcon) {
      if (st.is_paused) {
        pauseText.textContent = "Resume Macro";
        pauseIcon.className = "fas fa-play";
      } else {
        pauseText.textContent = "Pause Macro";
        pauseIcon.className = "fas fa-pause";
      }
    }

    var footerId = document.getElementById("macro-footer-device-id");
    if (footerId) {
      var idStr = dev.device_id || "----";
      footerId.textContent = idStr.length > 18 ? idStr.substring(0, 18) + "..." : idStr;
    }

    var screenImg = document.getElementById("macro-screen-img");
    var placeholder = document.getElementById("macro-screen-placeholder");
    if (dev.has_screenshot && screenImg) {
      var sUid = currentUser && currentUser.id ? encodeURIComponent(currentUser.id) : "";
      screenImg.src = CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(dev.device_id) + "/screenshot?t=" + Date.now() + (sUid ? "&discord_user_id=" + sUid : "");
      screenImg.classList.remove("hidden");
      if (placeholder) placeholder.classList.add("hidden");
    }

    initMacroModeSelectorsOnce();
    if (st && st.settings) {
      populateMacroSettingsUI(st.settings);
    }
  }

  function updateTeamPillsUI(teamVal) {
    var teamDropdown = document.getElementById("macro-team-dropdown");
    if (teamDropdown && teamVal) {
      teamDropdown.value = String(teamVal);
    }
  }

  // ==========================================
  // MACRO STAGE & TEAM SELECTION
  // ==========================================

  var MACRO_STAGES_DATA = {
    story: {
      stages: [
        { label: "School Grounds", value: "School Grounds" },
        { label: "Flower Forest", value: "Flower Forest" },
        { label: "Rose Kingdom", value: "Rose Kingdom" },
        { label: "Fairy King Forest", value: "Fairy King Forest" },
        { label: "King's Tomb", value: "King's Tomb" },
        { label: "East Town", value: "East Town" },
        { label: "Crimson-Shore", value: "Crimson-Shore" }
      ],
      acts: ["Act 1", "Act 2", "Act 3", "Act 4", "Act 5", "Act 6", "Infinite", "Mastery"]
    },
    raid: {
      stages: [
        { label: "Spirit City", value: "Spirit City" },
        { label: "Snowy-Castle", value: "Snowy-Castle" }
      ],
      acts: ["Act 1", "Act 2", "Act 3"]
    },
    challenge: {
      stages: [
        { label: "School Grounds", value: "School Grounds" }
      ],
      acts: []
    },
    infinitytower: {
      stages: [
        { label: "School-Grounds", value: "School-Grounds" },
        { label: "Flower-Forest", value: "Flower-Forest" },
        { label: "Rose-Kingdom", value: "Rose-Kingdom" },
        { label: "Fairy-King-Forest", value: "Fairy-King-Forest" },
        { label: "Kings-Tomb", value: "Kings-Tomb" },
        { label: "East-Town", value: "East-Town" },
        { label: "Crimson-Shore", value: "Crimson-Shore" }
      ],
      acts: []
    },
    portals: {
      stages: [
        { label: "Summer", value: "Summer" },
        { label: "Sky-Ruins", value: "Sky-Ruins" }
      ],
      acts: []
    },
    event: {
      stages: [
        { label: "Tidal Siege", value: "Tidal Siege" }
      ],
      acts: []
    }
  };

  var activeMacroTeam = "none";
  var macroModeSelectorsInit = false;

  function initMacroModeSelectorsOnce() {
    if (macroModeSelectorsInit) return;
    macroModeSelectorsInit = true;
    window.onMacroModeChange();
  }

  window.onMacroTeamChange = function () {
    var teamSelect = document.getElementById("macro-team-dropdown");
    if (!teamSelect) return;
    activeMacroTeam = teamSelect.value;
    var cmdPayload = (activeMacroTeam === "none") ? "Skip Team" : ("Team " + activeMacroTeam);
    window.sendMacroCommand("SetTeam", cmdPayload);
  };

  window.setMacroTeam = function (teamNum) {
    var teamSelect = document.getElementById("macro-team-dropdown");
    if (teamSelect) {
      teamSelect.value = String(teamNum);
      window.onMacroTeamChange();
    }
  };

  window.onMacroModeChange = function () {
    var modeSelect = document.getElementById("macro-mode-dropdown");
    var stageSelect = document.getElementById("macro-stage-dropdown");
    var actSelect = document.getElementById("macro-act-dropdown");
    var actGroup = document.getElementById("macro-act-group");
    if (!modeSelect || !stageSelect) return;

    var modeKey = modeSelect.value;
    var data = MACRO_STAGES_DATA[modeKey] || MACRO_STAGES_DATA.story;

    stageSelect.innerHTML = "";
    data.stages.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.value;
      opt.textContent = s.label;
      stageSelect.appendChild(opt);
    });

    if (data.acts && data.acts.length > 0) {
      if (actGroup) actGroup.style.display = "flex";
      actSelect.innerHTML = "";
      data.acts.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        actSelect.appendChild(opt);
      });
    } else {
      if (actGroup) actGroup.style.display = "none";
    }
  };

  window.onMacroStageChange = function () {
    // Optional per-stage act filters
  };

  window.applyMacroStageSelection = function () {
    var modeSelect = document.getElementById("macro-mode-dropdown");
    var stageSelect = document.getElementById("macro-stage-dropdown");
    var actSelect = document.getElementById("macro-act-dropdown");
    if (!modeSelect || !stageSelect) return;

    var mode = modeSelect.value;
    var stage = stageSelect.value;
    var act = (actSelect && actSelect.value) ? actSelect.value : "";
    var teamSelect = document.getElementById("macro-team-dropdown");
    var team = (teamSelect && teamSelect.value) ? teamSelect.value : activeMacroTeam;
    var cmdPayload = "";

    if (mode === "story") {
      cmdPayload = "Selected Story Stage: " + stage + ", Act: " + act;
    } else if (mode === "raid") {
      cmdPayload = "Selected Raid: " + stage + ", Act: " + act;
    } else if (mode === "infinitytower") {
      cmdPayload = "Selected Mode: Infinity Tower: " + stage;
    } else if (mode === "portals") {
      cmdPayload = "Selected Mode: Portals: " + stage;
    } else if (mode === "event") {
      cmdPayload = "Selected Mode: Events: " + stage;
    }

    if (team === "none" || team === "0" || team === "skip") {
      cmdPayload += ": Skip Team";
    } else if (team) {
      cmdPayload += ": Team " + team;
    }

    window.sendMacroCommand("SelectedMode", cmdPayload);
  };

  window.submitPairCode = function () {
    var input = document.getElementById("macro-pair-code-input");
    var btn = document.getElementById("btn-pair-submit");
    if (!input) return;
    var rawCode = input.value.trim().toUpperCase();
    if (!rawCode) {
      showToast("Please enter a 6-digit Link Code", "error");
      return;
    }
    if (!rawCode.startsWith("AE-")) rawCode = "AE-" + rawCode;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="ch-spinner" style="width:16px;height:16px;margin:0"></div> Pairing...';
    }

    fetch(CYSLINK_API + "/api/v1/website/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        link_code: rawCode,
        discord_user_id: currentUser ? currentUser.id : null
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.detail || "Pairing failed");
          return data;
        });
      })
      .then(function (data) {
        activeMacroDevice = data;
        localStorage.setItem("cyslink_device_id", data.device_id);
        updateMacroNavBadge();
        renderMacroDashboard();
        showToast("Connected to " + (data.name || "Macro-PC") + "!", "success");
        input.value = "";
      })
      .catch(function (err) {
        showToast(err.message || "Failed to link code. Check code & try again.", "error");
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Pair Macro</span> <i class="fas fa-arrow-right"></i>';
        }
      });
  };

  window.unlinkActiveMacro = function () {
    if (!activeMacroDevice) return;
    var devId = activeMacroDevice.device_id;
    window.unlinkDeviceById(devId);
  };

  window.unlinkDeviceById = function (deviceId) {
    if (!deviceId) return;
    var devObj = userMacroDevicesList.find(function (d) { return d.device_id === deviceId; }) || activeMacroDevice;
    var devName = devObj ? (devObj.name || "Device") : "Device";
    if (!confirm("Are you sure you want to disconnect and unlink " + devName + " (" + deviceId.substring(0, 8) + ")? It will require re-pairing via Link Code.")) return;

    logMacroSecurity("Requesting unlink for device " + devName + " (" + deviceId.substring(0, 8) + ")...", "warn");
    var uid = currentUser && currentUser.id ? encodeURIComponent(currentUser.id) : null;

    fetch(CYSLINK_API + "/api/v1/website/user/" + uid + "/devices/" + encodeURIComponent(deviceId) + "/unlink", {
      method: "POST"
    })
      .then(function (res) {
        if (!res.ok) {
          // Fallback to general unlink
          return fetch(CYSLINK_API + "/api/v1/website/unlink", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_id: deviceId,
              discord_user_id: currentUser ? currentUser.id : null
            })
          });
        }
        return res.json();
      })
      .then(function () {
        logMacroSecurity("Successfully unlinked device " + deviceId.substring(0, 8), "success");
        showToast("Device unlinked", "info");
        if (activeMacroDevice && activeMacroDevice.device_id === deviceId) {
          activeMacroDevice = null;
          localStorage.removeItem("cyslink_device_id");
        }
        syncUserMacroDevices(false);
      })
      .catch(function (err) {
        logMacroSecurity("Unlink device failed: " + err.message, "error");
        showToast("Failed to unlink device", "error");
      });
  };

  window.unlinkAllDevicesFromModal = function () {
    if (!currentUser || !currentUser.id) {
      showToast("You must be logged in with Discord", "error");
      return;
    }
    if (!confirm("EMERGENCY UNLINK: This will disconnect and unlink ALL devices attached to your Discord account. Any remote macros will lose access until re-paired. Continue?")) return;

    logMacroSecurity("Purging ALL devices for Discord user " + currentUser.id + "...", "warn");
    fetch(CYSLINK_API + "/api/v1/website/user/" + encodeURIComponent(currentUser.id) + "/unlink-all", {
      method: "POST"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to unlink all devices (HTTP " + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        logMacroSecurity("Successfully purged all " + (data.count || "0") + " device(s)!", "success");
        showToast("All devices unlinked (" + (data.count || 0) + ")", "info");
        localStorage.removeItem("cyslink_device_id");
        activeMacroDevice = null;
        userMacroDevicesList = [];
        updateMacroNavBadge();
        updateMacroDevicePickerUI();
        renderMacroSecurityPanel();
        renderMacroPairingCard();
      })
      .catch(function (err) {
        logMacroSecurity("Unlink all devices failed: " + err.message, "error");
        showToast("Failed to unlink all devices", "error");
      });
  };

  window.refreshMacroStatus = function (feedback) {
    var btn = document.getElementById("macro-btn-refresh-status");
    if (btn) btn.classList.add("spinning");

    if (activeMacroDevice && activeMacroDevice.device_id) {
      fetchMacroStatus(activeMacroDevice.device_id, true);
    } else {
      syncUserMacroDevices(false);
    }

    setTimeout(function () {
      if (btn) btn.classList.remove("spinning");
      if (feedback) showToast("Status refreshed", "info");
    }, 600);
  };

  window.requestMacroScreenshot = function () {
    if (!activeMacroDevice || !activeMacroDevice.device_id) {
      showToast("No macro connected", "error");
      return;
    }
    if (!activeMacroDevice.online) {
      showToast("Macro is offline", "error");
      return;
    }

    var spinner = document.getElementById("macro-screen-spinner");
    var screenImg = document.getElementById("macro-screen-img");
    var placeholder = document.getElementById("macro-screen-placeholder");
    var timeEl = document.getElementById("macro-screen-time");

    if (spinner) spinner.classList.remove("hidden");

    var uid = currentUser && currentUser.id ? encodeURIComponent(currentUser.id) : "";
    var uidParam = uid ? "?discord_user_id=" + uid : "";

    fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(activeMacroDevice.device_id) + "/request-screenshot" + uidParam, {
      method: "POST"
    })
      .then(function (res) {
        if (res.status === 404) {
          // Fallback: dispatch ShowScreen command then fetch screenshot
          return fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(activeMacroDevice.device_id) + "/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "ShowScreen", payload: null, discord_user_id: currentUser ? String(currentUser.id) : null })
          }).then(function () {
            return new Promise(function (resolve) { setTimeout(resolve, 2500); }).then(function () {
              return fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(activeMacroDevice.device_id) + "/screenshot?t=" + Date.now() + (uid ? "&discord_user_id=" + uid : ""));
            });
          }).then(function (r2) {
            if (!r2.ok) throw new Error("Screenshot not available yet");
            return r2.blob();
          });
        }
        if (!res.ok) throw new Error("Screenshot failed");
        return res.blob();
      })
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        if (screenImg) {
          screenImg.src = objUrl;
          screenImg.classList.remove("hidden");
        }
        if (placeholder) placeholder.classList.add("hidden");
        if (timeEl) timeEl.textContent = "Captured " + new Date().toLocaleTimeString();
        logMacroSecurity("Screenshot received successfully for " + (activeMacroDevice.name || "Device"), "success");
        showToast("Screen captured!", "success");
      })
      .catch(function (err) {
        logMacroSecurity("Screenshot capture failed: " + err.message, "warn");
        showToast("Screenshot capture timed out. Is Roblox running?", "error");
      })
      .finally(function () {
        if (spinner) spinner.classList.add("hidden");
      });
  };

  window.sendMacroCommand = function (command, payload) {
    if (!activeMacroDevice || !activeMacroDevice.device_id) {
      showToast("No macro connected. Please pair first.", "error");
      window.openMacroRemoteModal();
      return;
    }
    if (!activeMacroDevice.online) {
      showToast("Macro is offline", "error");
      return;
    }

    var uid = currentUser && currentUser.id ? String(currentUser.id) : null;
    fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(activeMacroDevice.device_id) + "/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: command, payload: payload || null, discord_user_id: uid })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.detail || "Command failed");
          return data;
        });
      })
      .then(function () {
        showToast("Sent: " + command, "success");
        setTimeout(function () {
          fetchMacroStatus(activeMacroDevice.device_id, true);
        }, 800);
      })
      .catch(function (err) {
        showToast("Error: " + err.message, "error");
      });
  };

  window.toggleMacroPause = function () {
    var st = (activeMacroDevice && activeMacroDevice.status) || {};
    if (st.is_paused) {
      window.sendMacroCommand("ResumeMacro");
    } else {
      window.sendMacroCommand("PauseMacro");
    }
  };

  window.confirmMacroShutdown = function () {
    if (confirm("Shut down your PC via macro?")) {
      window.sendMacroCommand("ShutdownPC");
    }
  };

  window.submitInjectCode = function () {
    var input = document.getElementById("macro-inject-code");
    if (!input) return;
    var code = input.value.trim().toUpperCase();
    if (!code) {
      showToast("Enter a share code", "error");
      return;
    }
    window.sendConfigCodeToMacro(code);
  };

  window.sendConfigCodeToMacro = function (shareCode, configName) {
    if (!shareCode) return;
    var cleanCode = shareCode.trim().toUpperCase();

    // 1. If inside native Macro WebView2 window: direct import
    if (window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahk) {
      try {
        window.chrome.webview.hostObjects.ahk.Import(cleanCode);
        showToast("Sent " + cleanCode + " to macro.", "success");
        return;
      } catch (e) {
        console.warn("Native import error, falling back to server:", e);
      }
    }

    // 2. Web browser: relay through server
    if (!activeMacroDevice || !activeMacroDevice.device_id) {
      showToast("Connect your macro first.", "info");
      window.openMacroRemoteModal();
      var injectInput = document.getElementById("macro-inject-code");
      if (injectInput) injectInput.value = cleanCode;
      return;
    }

    if (!activeMacroDevice.online) {
      showToast("Macro is offline. Start it on your PC.", "error");
      return;
    }

    showToast("Sending " + cleanCode + "...", "info");
    fetch(CYSLINK_API + "/api/v1/website/devices/" + encodeURIComponent(activeMacroDevice.device_id) + "/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "LoadShareCode",
        payload: cleanCode
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.detail || "Failed to send");
          return data;
        });
      })
      .then(function () {
        showToast("Loaded " + cleanCode + " into macro.", "success");
      })
      .catch(function (err) {
        showToast("Failed to send config: " + err.message, "error");
      });
  };

  window.sendCurrentConfigToMacro = function () {
    if (!currentDetailConfig || !currentDetailConfig.share_code) {
      showToast("No config open", "error");
      return;
    }
    window.sendConfigCodeToMacro(currentDetailConfig.share_code, currentDetailConfig.name);
  };

  window.quickSendToMacro = function (shareCode, configName) {
    window.sendConfigCodeToMacro(shareCode, configName);
  };

  // ==========================================
  // MACRO SETTINGS MANAGEMENT
  // ==========================================

  var macroSettingsActiveTab = "delays";
  var macroSettingsPanelOpen = true;

  window.toggleMacroSettingsPanel = function () {
    var body = document.getElementById("macro-settings-body");
    var arrow = document.getElementById("macro-settings-collapse-arrow");
    if (!body) return;
    macroSettingsPanelOpen = !macroSettingsPanelOpen;
    if (macroSettingsPanelOpen) {
      body.classList.remove("collapsed");
      if (arrow) arrow.style.transform = "rotate(0deg)";
    } else {
      body.classList.add("collapsed");
      if (arrow) arrow.style.transform = "rotate(-90deg)";
    }
  };

  window.switchMacroSettingsTab = function (tabId) {
    macroSettingsActiveTab = tabId;
    var tabBtns = document.querySelectorAll(".macro-tab-btn");
    var tabPanes = document.querySelectorAll(".macro-tab-content");

    tabBtns.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    tabPanes.forEach(function (pane) {
      if (pane.id === "macro-tab-" + tabId) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });
  };

  function populateMacroSettingsUI(settings) {
    if (!settings || typeof settings !== "object") return;

    function setNum(id, val) {
      var el = document.getElementById(id);
      if (el && val !== undefined && val !== null && !el.matches(":focus")) {
        el.value = Number(val);
      }
    }

    function setCheck(id, val) {
      var el = document.getElementById(id);
      if (el && val !== undefined && val !== null) {
        el.checked = Boolean(Number(val));
      }
    }

    // Delays
    setNum("mset-placement-delay", settings.PlacementDelay !== undefined ? settings.PlacementDelay : 1250);
    setNum("mset-upgrade-delay", settings.UpgradeDelay !== undefined ? settings.UpgradeDelay : 350);
    setNum("mset-click-delay", settings.ClickDelay !== undefined ? settings.ClickDelay : 100);
    setNum("mset-ingame-delay", settings.InGameDelay !== undefined ? settings.InGameDelay : 6000);
    setNum("mset-zoom-scrolls", settings.ZoomScrolls !== undefined ? settings.ZoomScrolls : 15);
    setNum("mset-placement-timeout", settings.PlacementTimeoutEdit !== undefined ? settings.PlacementTimeoutEdit : 15);
    setNum("mset-upgrade-timeout", settings.UpgradeTimeoutEdit !== undefined ? settings.UpgradeTimeoutEdit : 15);

    // Challenges
    setCheck("mset-enable-challenges", settings.EnableChallenges);
    setCheck("mset-enable-daily-challenge", settings.EnableDailyChallenge);
    setCheck("mset-chal-1", settings.Chal1Cb !== undefined ? settings.Chal1Cb : 1);
    setCheck("mset-chal-2", settings.Chal2Cb);
    setCheck("mset-chal-3", settings.Chal3Cb);

    // General & Safety
    setCheck("mset-click-next", settings.ClickNext);
    setCheck("mset-read-ocr", settings.ReadMatchRewards !== undefined ? settings.ReadMatchRewards : 1);
    setCheck("mset-golden-hour", settings.EnableGoldenHour);
    setNum("mset-reconnect-attempts", settings.ReconnectAttempts !== undefined ? settings.ReconnectAttempts : 15);
    setNum("mset-reconnect-wait", settings.ReconnectWait !== undefined ? settings.ReconnectWait : 3000);
  }

  window.saveMacroSettingsFromWeb = function () {
    if (!activeMacroDevice || !activeMacroDevice.device_id) {
      showToast("No macro connected", "error");
      return;
    }
    if (!activeMacroDevice.online) {
      showToast("Macro is offline", "error");
      return;
    }

    function getNum(id, defaultVal) {
      var el = document.getElementById(id);
      if (!el || el.value === "") return defaultVal;
      var num = Number(el.value);
      return isNaN(num) ? defaultVal : num;
    }

    function getCheck(id) {
      var el = document.getElementById(id);
      return (el && el.checked) ? 1 : 0;
    }

    var payload = {
      PlacementDelay: Math.max(50, getNum("mset-placement-delay", 1250)),
      UpgradeDelay: Math.max(50, getNum("mset-upgrade-delay", 350)),
      ClickDelay: Math.max(20, getNum("mset-click-delay", 100)),
      InGameDelay: Math.max(500, getNum("mset-ingame-delay", 6000)),
      ZoomScrolls: Math.max(0, getNum("mset-zoom-scrolls", 15)),
      PlacementTimeoutEdit: Math.max(1, getNum("mset-placement-timeout", 15)),
      UpgradeTimeoutEdit: Math.max(1, getNum("mset-upgrade-timeout", 15)),

      EnableChallenges: getCheck("mset-enable-challenges"),
      EnableDailyChallenge: getCheck("mset-enable-daily-challenge"),
      Chal1Cb: getCheck("mset-chal-1"),
      Chal2Cb: getCheck("mset-chal-2"),
      Chal3Cb: getCheck("mset-chal-3"),

      ClickNext: getCheck("mset-click-next"),
      ReadMatchRewards: getCheck("mset-read-ocr"),
      EnableGoldenHour: getCheck("mset-golden-hour"),
      ReconnectAttempts: Math.max(1, getNum("mset-reconnect-attempts", 15)),
      ReconnectWait: Math.max(500, getNum("mset-reconnect-wait", 3000))
    };

    var btn = document.getElementById("btn-save-macro-settings");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
    }

    window.sendMacroCommand("UpdateSettings", JSON.stringify(payload));

    if (activeMacroDevice.status) {
      if (!activeMacroDevice.status.settings) activeMacroDevice.status.settings = {};
      Object.assign(activeMacroDevice.status.settings, payload);
    }

    setTimeout(function () {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> <span>Apply Settings</span>';
      }
    }, 1200);
  };
})();


