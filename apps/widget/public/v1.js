/**
 * CommerceChat embeddable widget v1 (vanilla JS, no dependencies).
 * Usage: <script src="https://api.example.com/widget/v1.js" data-api-key="pk_live_..." async></script>
 * WordPress stores may use the CommerceChat Connector key: data-api-key="cc_wp_..."
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }

  var apiKey = script.getAttribute("data-api-key");
  if (!apiKey) {
    try {
      apiKey = new URL(script.src).searchParams.get("api_key");
    } catch (e) {
      apiKey = null;
    }
  }
  if (!apiKey || (!apiKey.startsWith("pk_live_") && !apiKey.startsWith("cc_wp_"))) {
    console.warn("[CommerceChat] Missing or invalid data-api-key");
    return;
  }

  var scriptUrlParams = null;
  try {
    scriptUrlParams = new URL(script.src).searchParams;
  } catch (e) {
    scriptUrlParams = null;
  }

  var apiBase = script.getAttribute("data-api-url");
  if (!apiBase && scriptUrlParams) {
    apiBase = scriptUrlParams.get("api_url");
  }
  if (!apiBase) {
    try {
      var u = new URL(script.src);
      apiBase = u.origin;
    } catch (e) {
      apiBase = "";
    }
  }
  apiBase = apiBase.replace(/\/$/, "");

  var STORAGE_KEY = "cc_session_" + apiKey.slice(0, 16);
  var sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = "web_sess_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(STORAGE_KEY, sessionId);
  }

  var state = {
    open: false,
    loading: false,
    config: null,
    suggestedQuestions: null,
    messages: [],
    primaryColor: "#4F46E5",
    position: "bottom-right",
    viewportHeight: null,
    viewportTop: 0,
    inputFocused: false,
    inputDraft: "",
  };

  function activeSuggestedQuestions() {
    if (state.suggestedQuestions && state.suggestedQuestions.length) {
      return state.suggestedQuestions;
    }
    if (state.config && state.config.suggestedQuestions && state.config.suggestedQuestions.length) {
      return state.config.suggestedQuestions;
    }
    return [];
  }

  function applyChatContext(data) {
    if (!data) return;
    if (data.suggestedQuestions && data.suggestedQuestions.length) {
      state.suggestedQuestions = data.suggestedQuestions;
    }
  }

  function logoSvg(size) {
    var s = size || 28;
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect width="64" height="64" rx="16" fill="#EAF7FF"/>' +
      '<path d="M17 43.5L29.3 21.8C30.5 19.7 33.5 19.7 34.7 21.8L47 43.5" stroke="#0A84FF" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M25.5 34.5H38.5" stroke="#58B7FF" stroke-width="4" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  var root = document.createElement("commercechat-root");
  root.id = "commercechat-widget";
  root.setAttribute("data-cc-root", "1");
  // Dawn and other Shopify themes hide empty divs (div:empty { display:none }). Use a
  // custom element host so theme resets do not hide the shadow root.
  root.style.cssText =
    "display:block!important;position:fixed;inset:0;z-index:2147483000;pointer-events:none;" +
    "width:0;height:0;margin:0;padding:0;border:0;overflow:visible;background:transparent;";
  var shadow = root.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = getStyles();
  shadow.appendChild(style);

  var container = document.createElement("div");
  container.className = "cc-root";
  shadow.appendChild(container);

  function mountRoot() {
    if (!document.body) return false;
    if (!root.isConnected) document.body.appendChild(root);
    return true;
  }

  function getStyles() {
    return (
      ".cc-root{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.4;}" +
      ".cc-bubble{position:fixed;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;pointer-events:auto;}" +
      ".cc-bubble svg{width:32px;height:32px;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.12));}" +
      ".cc-bubble-br{bottom:20px;right:20px}.cc-bubble-bl{bottom:20px;left:20px}" +
      ".cc-panel{position:fixed;z-index:2147483001;width:380px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 100px);" +
      "background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;}" +
      ".cc-panel-br{bottom:88px;right:20px}.cc-panel-bl{bottom:88px;left:20px}" +
      ".cc-header{padding:14px 16px;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto;}" +
      ".cc-brand{display:flex;align-items:center;gap:8px;min-width:0}.cc-brand-logo{display:flex;width:28px;height:28px;border-radius:8px;overflow:hidden;flex:0 0 auto}.cc-brand-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".cc-close{background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;opacity:.9}" +
      ".cc-messages{flex:1;min-height:0;overflow-y:auto;padding:12px;background:#f8fafc;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}" +
      ".cc-msg{margin-bottom:10px;max-width:88%;padding:10px 12px;border-radius:12px;word-wrap:break-word;}" +
      ".cc-msg-user{margin-left:auto;background:var(--cc-primary,#4F46E5);color:#fff;border-bottom-right-radius:4px;}" +
      ".cc-msg-bot{background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px;line-height:1.55;}" +
      ".cc-msg-bot strong{font-weight:600;color:#0f172a;}" +
      ".cc-msg-bot a{color:var(--cc-primary,#4F46E5);}" +
      ".cc-suggestions{padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid #e2e8f0;background:#fff;flex:0 0 auto;}" +
      ".cc-chip{font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;}" +
      ".cc-chip:hover{border-color:var(--cc-primary,#4F46E5);color:var(--cc-primary,#4F46E5);}" +
      ".cc-input-row{display:flex;gap:8px;padding:12px max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));border-top:1px solid #e2e8f0;background:#fff;flex:0 0 auto;}" +
      ".cc-input{flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:16px;line-height:20px;outline:none;-webkit-appearance:none;appearance:none;}" +
      ".cc-input:focus{border-color:var(--cc-primary,#4F46E5);}" +
      ".cc-send{border:none;border-radius:10px;padding:10px 14px;color:#fff;cursor:pointer;font-weight:600;min-height:42px;}" +
      ".cc-send:disabled{opacity:.5;cursor:not-allowed}" +
      ".cc-typing{font-size:12px;color:#64748b;padding:4px 12px;}" +
      ".cc-msg-actions{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 10px 0;max-width:88%;}" +
      ".cc-action-chip{font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;text-align:left;}" +
      ".cc-action-chip:hover{border-color:var(--cc-primary,#4F46E5);color:var(--cc-primary,#4F46E5);}" +
      ".cc-product-list{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;margin:-2px 0 10px 0;max-width:94%;-webkit-overflow-scrolling:touch;}" +
      ".cc-product-card{flex:0 0 240px;scroll-snap-align:start;display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04);}" +
      ".cc-product-media{position:relative;}" +
      ".cc-product-img{width:100%;height:140px;border-radius:8px;background:#e2e8f0;object-fit:cover;display:block;}" +
      ".cc-product-img-fallback{display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;font-size:28px;height:140px;}" +
      ".cc-product-dots{display:flex;justify-content:center;gap:4px;margin-top:4px;}" +
      ".cc-product-dot{width:6px;height:6px;border-radius:50%;background:#cbd5e1;border:none;padding:0;}" +
      ".cc-product-dot-active{background:var(--cc-primary,#4F46E5);}" +
      ".cc-product-body{min-width:0;display:flex;flex-direction:column;gap:4px;}" +
      ".cc-product-name{font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".cc-product-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;}" +
      ".cc-product-price{font-weight:700;color:#0f172a;}" +
      ".cc-product-desc{font-size:12px;color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35;}" +
      ".cc-product-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;}" +
      ".cc-product-btn{font-size:12px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;padding:6px 8px;cursor:pointer;text-decoration:none;color:#0f172a;}" +
      ".cc-product-btn-primary{border-color:var(--cc-primary,#4F46E5);background:var(--cc-primary,#4F46E5);color:#fff;}" +
      ".cc-product-btn:disabled{opacity:.5;cursor:not-allowed;}" +
      "@media (max-width:480px){.cc-bubble-br{bottom:max(16px,env(safe-area-inset-bottom));right:16px}.cc-bubble-bl{bottom:max(16px,env(safe-area-inset-bottom));left:16px}.cc-panel{top:var(--cc-vv-top,0px);left:0;right:0;bottom:auto;width:100vw;max-width:100vw;height:var(--cc-vv-height,100dvh);max-height:var(--cc-vv-height,100dvh);border-radius:0;box-shadow:none}.cc-panel-br,.cc-panel-bl{bottom:auto;right:0;left:0}.cc-header{padding-top:max(12px,env(safe-area-inset-top));}.cc-messages{padding:10px 10px 12px}.cc-msg{max-width:92%;padding:9px 11px}.cc-suggestions{flex-wrap:nowrap;overflow-x:auto;padding:8px 10px;-webkit-overflow-scrolling:touch}.cc-chip{white-space:nowrap;flex:0 0 auto}.cc-input-row{position:sticky;bottom:0;gap:6px}.cc-send{padding:10px 12px}.cc-product-list{max-width:100%;gap:8px}.cc-product-card{flex-basis:min(78vw,220px)}.cc-product-img,.cc-product-img-fallback{height:118px}.cc-product-desc{-webkit-line-clamp:1;}}" +
      "@supports (height:100dvh){@media (max-width:480px){.cc-panel{height:var(--cc-vv-height,100dvh);max-height:var(--cc-vv-height,100dvh);}}}"
    );
  }

  function updateViewportVars() {
    var vv = window.visualViewport;
    var height = vv ? vv.height : window.innerHeight;
    var top = vv ? vv.offsetTop || 0 : 0;
    state.viewportHeight = Math.max(320, Math.floor(height || window.innerHeight || 600));
    state.viewportTop = Math.max(0, Math.floor(top || 0));
    container.style.setProperty("--cc-vv-height", state.viewportHeight + "px");
    container.style.setProperty("--cc-vv-top", state.viewportTop + "px");
  }

  function bindViewportListeners() {
    if (bindViewportListeners.bound) return;
    bindViewportListeners.bound = true;
    updateViewportVars();
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateViewportVars);
      vv.addEventListener("scroll", updateViewportVars);
    }
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", function () {
      setTimeout(function () {
        updateViewportVars();
        render();
      }, 250);
    });
  }

  function posClass(prefix) {
    return state.position === "bottom-left" ? prefix + "-bl" : prefix + "-br";
  }

  function render() {
    if (!mountRoot()) return;
    bindViewportListeners();
    updateViewportVars();
    container.innerHTML = "";
    container.style.setProperty("--cc-primary", state.primaryColor);

    if (!state.open) {
      var bubble = document.createElement("button");
      bubble.className = "cc-bubble " + posClass("cc-bubble");
      bubble.style.background = state.primaryColor;
      bubble.setAttribute("aria-label", "Open chat");
      bubble.innerHTML = logoSvg(32);
      bubble.onclick = function () {
        state.open = true;
        render();
        if (!state.messages.length && state.config) {
          addBotMessage(state.config.greeting || "Hi! How can I help?");
        }
      };
      container.appendChild(bubble);
      return;
    }

    var panel = document.createElement("div");
    panel.className = "cc-panel " + posClass("cc-panel");

    var header = document.createElement("div");
    header.className = "cc-header";
    header.style.background = state.primaryColor;
    header.innerHTML =
      '<span class="cc-brand"><span class="cc-brand-logo">' +
      logoSvg(28) +
      '</span><span class="cc-brand-name">' +
      escapeHtml((state.config && state.config.storeName) || "Chat") +
      '</span></span><button class="cc-close" aria-label="Close">×</button>';
    header.querySelector(".cc-close").onclick = function () {
      state.open = false;
      render();
    };
    panel.appendChild(header);

    var messagesEl = document.createElement("div");
    messagesEl.className = "cc-messages";
    state.messages.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "cc-msg " + (m.role === "user" ? "cc-msg-user" : "cc-msg-bot");
      if (m.role === "user") {
        el.textContent = m.text;
      } else {
        el.innerHTML = formatBotText(m.text);
      }
      messagesEl.appendChild(el);
      if (m.actions && m.actions.length) {
        var actions = document.createElement("div");
        actions.className = "cc-msg-actions";
        m.actions.forEach(function (a) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "cc-action-chip";
          chip.textContent = a.label || a.sku;
          chip.onclick = function () {
            handleWidgetAction(a);
          };
          actions.appendChild(chip);
        });
        messagesEl.appendChild(actions);
      }
      if (m.cards && m.cards.length) {
        messagesEl.appendChild(renderProductCards(m.cards));
      }
    });
    if (state.loading) {
      var typing = document.createElement("div");
      typing.className = "cc-typing";
      typing.textContent = "Typing…";
      messagesEl.appendChild(typing);
    }
    panel.appendChild(messagesEl);

    var suggestions = activeSuggestedQuestions();
    if (suggestions.length) {
      var sug = document.createElement("div");
      sug.className = "cc-suggestions";
      suggestions.slice(0, 3).forEach(function (q) {
        var chip = document.createElement("button");
        chip.className = "cc-chip";
        chip.type = "button";
        chip.textContent = q;
        chip.onclick = function () {
          sendMessage(q);
        };
        sug.appendChild(chip);
      });
      panel.appendChild(sug);
    }

    var inputRow = document.createElement("div");
    inputRow.className = "cc-input-row";
    var input = document.createElement("input");
    input.className = "cc-input";
    input.placeholder = "Ask a question…";
    input.value = state.inputDraft || "";
    input.autocomplete = "off";
    input.setAttribute("enterkeyhint", "send");
    input.setAttribute("aria-label", "Chat message");
    var sendBtn = document.createElement("button");
    sendBtn.className = "cc-send";
    sendBtn.style.background = state.primaryColor;
    sendBtn.textContent = "Send";
    sendBtn.disabled = state.loading;

    function submit() {
      var text = input.value.trim();
      if (!text || state.loading) return;
      input.value = "";
      state.inputDraft = "";
      state.inputFocused = true;
      sendMessage(text);
    }

    sendBtn.onclick = submit;
    input.onkeydown = function (e) {
      if (e.key === "Enter") submit();
    };
    input.oninput = function () {
      state.inputDraft = input.value;
    };
    input.onfocus = function () {
      state.inputFocused = true;
      setTimeout(function () {
        updateViewportVars();
        messagesEl.scrollTop = messagesEl.scrollHeight;
        input.scrollIntoView({ block: "nearest" });
      }, 80);
    };
    input.onblur = function () {
      state.inputFocused = false;
    };

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    container.appendChild(panel);

    requestAnimationFrame(function () {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (state.open && state.inputFocused) {
        try {
          input.focus({ preventScroll: true });
        } catch (e) {
          input.focus();
        }
      }
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBotText(text) {
    var s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    s = s.replace(/\s+(\d+)\.\s+/g, "<br>$1. ");
    s = s.replace(/\n\n+/g, "<br><br>");
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  function formatPrice(price, currency) {
    var code = currency || "USD";
    var locale = code === "LKR" ? "en-LK" : undefined;
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
      }).format(Number(price || 0));
    } catch (e) {
      return code + " " + price;
    }
  }

  function renderProductCards(cards) {
    var list = document.createElement("div");
    list.className = "cc-product-list";
    cards.forEach(function (card) {
      var el = document.createElement("div");
      el.className = "cc-product-card";

      var media = document.createElement("div");
      media.className = "cc-product-media";
      var urls = [];
      if (card.imageUrls && card.imageUrls.length) urls = card.imageUrls.slice(0, 5);
      else if (card.imageUrl) urls = [card.imageUrl];

      var imageIndex = 0;
      function renderImage() {
        media.innerHTML = "";
        if (urls.length) {
          var img = document.createElement("img");
          img.className = "cc-product-img";
          img.src = urls[imageIndex];
          img.alt = card.name || card.sku || "Product";
          img.loading = "lazy";
          media.appendChild(img);
          if (urls.length > 1) {
            var dots = document.createElement("div");
            dots.className = "cc-product-dots";
            urls.forEach(function (_url, idx) {
              var dot = document.createElement("button");
              dot.type = "button";
              dot.className = "cc-product-dot" + (idx === imageIndex ? " cc-product-dot-active" : "");
              dot.setAttribute("aria-label", "Image " + (idx + 1));
              dot.onclick = function (e) {
                e.stopPropagation();
                imageIndex = idx;
                renderImage();
              };
              dots.appendChild(dot);
            });
            media.appendChild(dots);
          }
        } else {
          var fallback = document.createElement("div");
          fallback.className = "cc-product-img cc-product-img-fallback";
          fallback.textContent = (card.name || card.sku || "?").slice(0, 1).toUpperCase();
          media.appendChild(fallback);
        }
      }
      renderImage();
      el.appendChild(media);

      var body = document.createElement("div");
      body.className = "cc-product-body";

      var name = document.createElement("div");
      name.className = "cc-product-name";
      name.textContent = card.name || card.sku || "Product";
      body.appendChild(name);

      var meta = document.createElement("div");
      meta.className = "cc-product-meta";
      var price = document.createElement("span");
      price.className = "cc-product-price";
      price.textContent = formatPrice(card.price, card.currency);
      meta.appendChild(price);
      var stock = document.createElement("span");
      stock.textContent = card.inStock === false ? "Out of stock" : "In stock";
      meta.appendChild(stock);
      body.appendChild(meta);

      if (card.description) {
        var desc = document.createElement("div");
        desc.className = "cc-product-desc";
        desc.textContent = card.description;
        body.appendChild(desc);
      }

      var buttons = document.createElement("div");
      buttons.className = "cc-product-buttons";

      var add = document.createElement("button");
      add.type = "button";
      add.className = "cc-product-btn cc-product-btn-primary";
      add.textContent = "Add to cart";
      add.disabled = card.inStock === false;
      add.onclick = function () {
        addToCartDirect(card.sku || card.name, 1);
      };
      buttons.appendChild(add);

      var details = document.createElement(card.url ? "a" : "button");
      details.className = "cc-product-btn";
      details.textContent = "Details";
      if (card.url) {
        details.href = card.url;
        details.target = "_blank";
        details.rel = "noopener noreferrer";
      } else {
        details.type = "button";
        details.onclick = function () {
          sendMessage("Tell me more about " + (card.sku || card.name));
        };
      }
      buttons.appendChild(details);
      body.appendChild(buttons);

      el.appendChild(body);
      list.appendChild(el);
    });
    return list;
  }

  function addUserMessage(text) {
    state.messages.push({ role: "user", text: text });
    render();
  }

  function addBotMessage(text, actions) {
    state.messages.push({ role: "bot", text: text, actions: actions || null, cards: null });
    render();
    return state.messages.length - 1;
  }

  function updateBotMessage(index, patch) {
    if (!state.messages[index]) return;
    for (var key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        state.messages[index][key] = patch[key];
      }
    }
    render();
  }

  function handleWidgetAction(a) {
    if (!a) return;
    if (a.action === "add_to_cart" && a.sku) {
      addToCartDirect(a.sku, 1);
      return;
    }
    if (a.action === "checkout") {
      sendMessage(a.message || "I'm ready to checkout");
      return;
    }
    if (a.message) {
      sendMessage(a.message);
      return;
    }
    if (a.sku) {
      sendMessage("Tell me more about " + (a.label || a.sku));
    }
  }

  function addToCartDirect(sku, quantity) {
    if (!sku) return;
    state.loading = true;
    render();
    fetch(apiBase + "/api/v1/widget/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sessionId: sessionId,
        sku: sku,
        quantity: quantity || 1,
      }),
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) {
            var err = (json && json.error && json.error.message) || json.message || "Could not add to cart";
            throw new Error(err);
          }
          return json.data || json;
        });
      })
      .then(function (data) {
        addBotMessage(data.message || "Added to your cart.");
      })
      .catch(function (err) {
        addBotMessage("Sorry — " + (err.message || "could not add to cart."));
        console.warn("[CommerceChat] add to cart", err);
      })
      .finally(function () {
        state.loading = false;
        render();
      });
  }

  function sendMessage(text) {
    addUserMessage(text);
    state.loading = true;
    render();

    sendStreamingMessage(text)
      .catch(function (err) {
        console.warn("[CommerceChat] stream fallback", err);
        return sendSyncMessage(text);
      })
      .catch(function (err) {
        var hint =
          window.location.protocol === "file:"
            ? "Open this page at http://localhost:3001/widget/demo.html (not file://)."
            : err && err.message
              ? err.message
              : "Network error — is the API running on port 3001?";
        addBotMessage("Sorry, something went wrong. " + hint);
        console.warn("[CommerceChat]", err);
      })
      .finally(function () {
        state.loading = false;
        render();
      });
  }

  function sendSyncMessage(text) {
    return fetch(apiBase + "/api/v1/widget/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sessionId: sessionId,
        message: text,
        metadata: {
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        },
      }),
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error((json.error && json.error.message) || "Chat failed");
          return json;
        });
      })
      .then(function (json) {
        var data = json.data || json;
        applyChatContext(data);
        var reply = data.reply && data.reply.content;
        var actions = data.suggestedActions;
        var cards = data.productCards;
        if (reply) {
          var idx = addBotMessage(reply, actions);
          updateBotMessage(idx, { cards: cards || null });
        }
        else addBotMessage("Sorry, I could not respond right now.");
        render();
      });
  }

  function parseSseBlock(block) {
    var event = "message";
    var data = "";
    block.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf("event:") === 0) event = line.slice(6).trim();
      if (line.indexOf("data:") === 0) data += line.slice(5).trim();
    });
    if (!data) return null;
    return { event: event, data: JSON.parse(data) };
  }

  function sendStreamingMessage(text) {
    return fetch(apiBase + "/api/v1/widget/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sessionId: sessionId,
        message: text,
        metadata: {
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        },
      }),
    }).then(function (res) {
      if (!res.ok || !res.body) {
        return res.text().then(function (body) {
          var message = "Chat stream failed";
          try {
            var json = JSON.parse(body);
            message = (json.error && json.error.message) || message;
          } catch (e) {}
          throw new Error(message);
        });
      }

      var botIndex = addBotMessage("");
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var cards = [];

      function handleEvent(evt) {
        if (!evt) return;
        if (evt.event === "token") {
          var current = state.messages[botIndex] && state.messages[botIndex].text ? state.messages[botIndex].text : "";
          if (current === "…" || current === "..." || current === "… ") current = "";
          updateBotMessage(botIndex, { text: current + (evt.data.text || "") });
        } else if (evt.event === "typing") {
          if (!state.messages[botIndex] || !state.messages[botIndex].text) {
            updateBotMessage(botIndex, { text: "…" });
          }
        } else if (evt.event === "product_card") {
          cards.push(evt.data);
          updateBotMessage(botIndex, { cards: cards.slice() });
        } else if (evt.event === "done") {
          applyChatContext(evt.data);
          var doneCards = evt.data.productCards && evt.data.productCards.length ? evt.data.productCards : cards;
          var doneReply = evt.data.reply && evt.data.reply.content;
          var existingText = state.messages[botIndex] && state.messages[botIndex].text;
          updateBotMessage(botIndex, {
            text: doneReply || (existingText === "…" ? "" : existingText),
            actions: evt.data.suggestedActions || null,
            cards: doneCards && doneCards.length ? doneCards : null,
          });
          render();
        }
      }

      function pump() {
        return reader.read().then(function (result) {
          buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
          var parts = buffer.split(/\n\n/);
          buffer = parts.pop() || "";
          parts.forEach(function (part) {
            handleEvent(parseSseBlock(part));
          });
          if (result.done) {
            if (buffer.trim()) handleEvent(parseSseBlock(buffer));
            if (!state.messages[botIndex] || !state.messages[botIndex].text) {
              updateBotMessage(botIndex, { text: "Sorry, I could not respond right now." });
            }
            return;
          }
          return pump();
        });
      }

      return pump();
    });
  }

  function boot() {
    fetch(apiBase + "/api/v1/widget/config", {
      headers: { "X-API-Key": apiKey },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json.success && json.data) {
          if (json.data.enabled === false) {
            console.info("[CommerceChat] Widget disabled for this store");
            return;
          }
          state.config = json.data;
          state.primaryColor = json.data.primaryColor || state.primaryColor;
          state.position = json.data.position || state.position;
          if (!state.suggestedQuestions && json.data.suggestedQuestions) {
            state.suggestedQuestions = json.data.suggestedQuestions;
          }
        }
        render();
      })
      .catch(function () {
        render();
      });
  }

  function start() {
    if (mountRoot()) {
      boot();
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      setTimeout(start, 0);
    }
  }

  start();
})();
