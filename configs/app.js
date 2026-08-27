(function () {
  "use strict";

  // ==========================================
  // CONFIGURATION
  // ==========================================

  // Live Cloudflare Worker API URL
  var API_BASE = "https://cys-configs-api.cyszxz615.workers.dev";

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
    loadConfigs();
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
        if (currentUser.id === "1363171262314188951" || currentUser.is_admin) {
          currentUser.is_admin = true;
          currentUser.is_premium = true;
        }
        updateUIForLoggedIn();
      }
    } catch (e) {
      localStorage.removeItem("ch_user");
      localStorage.removeItem("ch_token");
    }
  }

  window.startDiscordLogin = function () {
    var params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds.members.read guilds",
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
        if (currentUser.id === "1363171262314188951" || currentUser.is_admin) {
          currentUser.is_admin = true;
          currentUser.is_premium = true;
        }
        localStorage.setItem("ch_user", JSON.stringify(currentUser));
        localStorage.setItem("ch_token", data.token);
        updateUIForLoggedIn();
        var roleTitle = currentUser.is_admin
          ? " (Admin)"
          : ((currentUser.is_config_maker || currentUser.is_creator)
            ? " (Config Maker)"
            : (currentUser.is_premium ? " (Donator)" : ""));
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

    // Set role badge
    var roleBadge = document.getElementById("nav-user-badge");
    if (roleBadge) {
      roleBadge.className = "user-role-badge";
      if (currentUser.is_admin) {
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
      : "https://cdn.discordapp.com/embed/avatars/0.png";
    document.getElementById("nav-user-avatar").src = avatarUrl;

    document.getElementById("nav-my-configs").classList.remove("hidden");
    document.getElementById("btn-my-configs").classList.remove("hidden");
  }

  window.toggleUserMenu = function () {
    // Simple logout for now
    if (confirm("Log out?")) {
      currentUser = null;
      localStorage.removeItem("ch_user");
      localStorage.removeItem("ch_token");
      location.reload();
    }
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
      card.className = "trending-card";
      card.onclick = function () {
        openDetailModal(config);
      };
      card.innerHTML =
        '<div class="trending-rank">#' +
        (i + 1) +
        "</div>" +
        '<div class="trending-name">' +
        escapeHtml(config.name) +
        "</div>" +
        '<div class="trending-meta">' +
        '<span><i class="fas fa-download"></i> ' +
        formatNumber(config.downloads || 0) +
        "</span>" +
        '<span><i class="fas fa-file-alt"></i> ' +
        (config.file_count || 1) +
        " file" + (config.file_count !== 1 ? "s" : "") + "</span>" +
        "</div>";
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
      if (role === "admin" || (config.author_name && config.author_name.toLowerCase().includes("cys"))) {
        authorBadgeHtml = '<span class="author-badge badge-admin"><i class="fas fa-crown"></i> STAFF</span>';
      } else if (role === "creator" || role === "config maker" || role === "config_maker" || role === "config makers") {
        authorBadgeHtml = '<span class="author-badge badge-creator"><i class="fas fa-hammer"></i> CONFIG MAKER</span>';
      } else if (role === "donator") {
        authorBadgeHtml = '<span class="author-badge badge-donator"><i class="fas fa-gem"></i> DONATOR</span>';
      }

      var card = document.createElement("div");
      card.className = "config-card";
      card.style.animationDelay = Math.min(index * 0.05, 0.5) + "s";
      card.onclick = function () {
        openDetailModal(config);
      };
      card.innerHTML =
        '<div class="config-glow"></div>' +
        '<div style="margin-bottom:0.35rem;"><span class="game-badge">' +
        escapeHtml(config.game || "Anime Expeditions") +
        "</span></div>" +
        '<div class="config-card-top">' +
        '<div class="config-card-title">' +
        escapeHtml(config.name) +
        "</div>" +
        '<span class="share-code-badge" onclick="event.stopPropagation(); copyShareCodeText(\'' + escapeHtml(config.share_code) + '\')" title="Click to copy code">' +
        escapeHtml(config.share_code) +
        "</span>" +
        "</div>" +
        '<div class="config-card-desc">' +
        escapeHtml(config.description || "No description") +
        "</div>" +
        '<div class="config-card-tags">' +
        tagsHtml +
        "</div>" +
        '<div class="config-card-footer">' +
        '<div class="config-author">' +
        '<img src="' +
        avatarUrl +
        '" alt="' +
        escapeHtml(config.author_name || "Unknown") +
        '" />' +
        "<span>" +
        escapeHtml(config.author_name || "Unknown") +
        "</span>" +
        authorBadgeHtml +
        "</div>" +
        '<div class="config-stats">' +
        '<button class="btn-like" id="btn-like-' + config.share_code + '" onclick="event.stopPropagation(); toggleLike(\'' + config.share_code + '\')" title="Upvote">' +
        '<i class="fas fa-heart"></i> <span id="likes-' + config.share_code + '">' + (config.likes || 0) + '</span>' +
        '</button>' +
        '<span><i class="fas fa-download"></i> ' +
        formatNumber(config.downloads || 0) +
        "</span>" +
        "</div>" +
        "</div>";
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
      if (currentFilter && currentFilter !== "all") {
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
    if (gameEl) gameEl.textContent = config.game || "Macro";
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
    if (createdEl) createdEl.textContent = formatDate(config.created_at);
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
      previewEl.textContent = "📦 Reading ZIP archive contents...";
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

    // Show edit & delete button if owner or admin
    var isOwnerOrAdmin = currentUser && (currentUser.id === config.author_id || currentUser.is_admin);
    var editBtn = document.getElementById("btn-edit-config");
    if (editBtn) {
      if (isOwnerOrAdmin) editBtn.classList.remove("hidden");
      else editBtn.classList.add("hidden");
    }
    var deleteBtn = document.getElementById("btn-delete-config");
    if (deleteBtn) {
      if (isOwnerOrAdmin) deleteBtn.classList.remove("hidden");
      else deleteBtn.classList.add("hidden");
    }

    // Reset copy button
    var copyBtn = document.getElementById("btn-copy-code");
    copyBtn.classList.remove("copied");
    copyBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';

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
          btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
        }, 2000);
      }
      showToast("Copied: " + code, "success");
    }, function () {
      showToast("Failed to copy to clipboard", "error");
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

  function parseAndPreviewZip(dataUri, callback) {
    try {
      if (typeof JSZip === "undefined") {
        callback("📦 ZIP Archive (Download to extract files)");
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
          var out = "📦 ZIP Archive (" + files.length + " file" + (files.length !== 1 ? "s" : "") + "):\n";
          files.forEach(function (f) {
            out += "  📄 " + f + "\n";
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
          callback("📦 ZIP Archive (" + files.length + " files)");
        });
      }).catch(function () {
        callback("📦 ZIP Archive");
      });
    } catch (e) {
      callback("📦 ZIP Archive");
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
    if (!currentUser || (currentUser.id !== currentDetailConfig.author_id && !currentUser.is_admin)) {
      showToast("You are not authorized to edit this config", "error");
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
        notice.innerHTML = '👑 <strong>Admin Mode</strong> - Full upload, edit, and moderation access.';
      } else if (currentUser.is_config_maker || currentUser.is_creator) {
        notice.className = "upload-role-notice config-maker";
        notice.innerHTML = '<i class="fas fa-hammer"></i> <strong>Config Maker Verified</strong> - Official Config Maker creator badge & 10MB upload limit enabled.';
      } else if (currentUser.is_premium) {
        notice.className = "upload-role-notice premium";
        notice.innerHTML = '💎 <strong>Donator Verified</strong> - Upload and edit access enabled.';
      } else {
        notice.className = "upload-role-notice member";
        notice.innerHTML = '🔒 <strong>Donator Required</strong> - Uploading is reserved for Discord Donators & Config Makers. <a href="https://discord.gg/cys" target="_blank" rel="noopener">Get role at discord.gg/cys</a>';
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
        validation.textContent = "✗ Invalid file type: " + f.name + ". Allowed: " + ALLOWED_EXTENSIONS.join(", ");
        validation.classList.remove("hidden");
        uploadFiles = [];
        updateSubmitButton();
        return;
      }
      totalSize += f.size;
    }

    if (totalSize > MAX_FILE_SIZE) {
      validation.className = "upload-validation invalid";
      validation.textContent = "✗ Total size too large (" + formatFileSize(totalSize) + "). Max limit is " + formatFileSize(MAX_FILE_SIZE);
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
      validation.textContent = "✓ 1 file ready for upload";
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
      validation.textContent = "✓ " + files.length + " files ready (will be auto-packaged as ZIP)";
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
    modal.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    modal.classList.remove("visible");
    document.body.style.overflow = "";
  };

  // Close modal on backdrop click
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("visible");
      document.body.style.overflow = "";
    }
  });

  // Close modal on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".modal-overlay.visible")
        .forEach(function (m) {
          m.classList.remove("visible");
        });
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
})();
