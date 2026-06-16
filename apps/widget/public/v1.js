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
    messages: [],
    primaryColor: "#4F46E5",
    position: "bottom-right",
  };

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
      ".cc-bubble-br{bottom:20px;right:20px}.cc-bubble-bl{bottom:20px;left:20px}" +
      ".cc-panel{position:fixed;z-index:2147483001;width:380px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 100px);" +
      "background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;}" +
      ".cc-panel-br{bottom:88px;right:20px}.cc-panel-bl{bottom:88px;left:20px}" +
      ".cc-header{padding:14px 16px;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center;}" +
      ".cc-close{background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;opacity:.9}" +
      ".cc-messages{flex:1;overflow-y:auto;padding:12px;background:#f8fafc;}" +
      ".cc-msg{margin-bottom:10px;max-width:88%;padding:10px 12px;border-radius:12px;word-wrap:break-word;}" +
      ".cc-msg-user{margin-left:auto;background:var(--cc-primary,#4F46E5);color:#fff;border-bottom-right-radius:4px;}" +
      ".cc-msg-bot{background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px;line-height:1.55;}" +
      ".cc-msg-bot strong{font-weight:600;color:#0f172a;}" +
      ".cc-msg-bot a{color:var(--cc-primary,#4F46E5);}" +
      ".cc-suggestions{padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid #e2e8f0;background:#fff;}" +
      ".cc-chip{font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;}" +
      ".cc-chip:hover{border-color:var(--cc-primary,#4F46E5);color:var(--cc-primary,#4F46E5);}" +
      ".cc-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0;background:#fff;}" +
      ".cc-input{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;}" +
      ".cc-input:focus{border-color:var(--cc-primary,#4F46E5);}" +
      ".cc-send{border:none;border-radius:10px;padding:10px 14px;color:#fff;cursor:pointer;font-weight:600;}" +
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
      ".cc-product-desc{font-size:12px;color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}" +
      ".cc-product-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;}" +
      ".cc-product-btn{font-size:12px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;padding:6px 8px;cursor:pointer;text-decoration:none;color:#0f172a;}" +
      ".cc-product-btn-primary{border-color:var(--cc-primary,#4F46E5);background:var(--cc-primary,#4F46E5);color:#fff;}" +
      ".cc-product-btn:disabled{opacity:.5;cursor:not-allowed;}" +
      "@media (max-width:480px){.cc-panel{inset:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}.cc-panel-br,.cc-panel-bl{bottom:auto;right:auto;left:auto}.cc-product-list{max-width:100%;}}"
    );
  }

  function posClass(prefix) {
    return state.position === "bottom-left" ? prefix + "-bl" : prefix + "-br";
  }

  function render() {
    if (!mountRoot()) return;
    container.innerHTML = "";
    container.style.setProperty("--cc-primary", state.primaryColor);

    if (!state.open) {
      var bubble = document.createElement("button");
      bubble.className = "cc-bubble " + posClass("cc-bubble");
      bubble.style.background = state.primaryColor;
      bubble.setAttribute("aria-label", "Open chat");
      bubble.textContent = "💬";
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
      '<span>' +
      escapeHtml((state.config && state.config.storeName) || "Chat") +
      '</span><button class="cc-close" aria-label="Close">×</button>';
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
            sendMessage("Tell me more about " + (a.label || a.sku));
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

    if (state.config && state.config.suggestedQuestions && state.config.suggestedQuestions.length) {
      var sug = document.createElement("div");
      sug.className = "cc-suggestions";
      state.config.suggestedQuestions.slice(0, 3).forEach(function (q) {
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
    input.disabled = state.loading;
    var sendBtn = document.createElement("button");
    sendBtn.className = "cc-send";
    sendBtn.style.background = state.primaryColor;
    sendBtn.textContent = "Send";
    sendBtn.disabled = state.loading;

    function submit() {
      var text = input.value.trim();
      if (!text || state.loading) return;
      input.value = "";
      sendMessage(text);
    }

    sendBtn.onclick = submit;
    input.onkeydown = function (e) {
      if (e.key === "Enter") submit();
    };

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    container.appendChild(panel);

    requestAnimationFrame(function () {
      messagesEl.scrollTop = messagesEl.scrollHeight;
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
        sendMessage("Add " + (card.sku || card.name) + " to my cart");
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
        var reply = json.data && json.data.reply && json.data.reply.content;
        var actions = json.data && json.data.suggestedActions;
        var cards = json.data && json.data.productCards;
        if (reply) {
          var idx = addBotMessage(reply, actions);
          updateBotMessage(idx, { cards: cards || null });
        }
        else addBotMessage("Sorry, I could not respond right now.");
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
          updateBotMessage(botIndex, { text: current + (evt.data.text || "") });
        } else if (evt.event === "typing") {
          updateBotMessage(botIndex, { text: "…" });
        } else if (evt.event === "product_card") {
          cards.push(evt.data);
          updateBotMessage(botIndex, { cards: cards.slice() });
        } else if (evt.event === "done") {
          var doneCards = evt.data.productCards && evt.data.productCards.length ? evt.data.productCards : cards;
          updateBotMessage(botIndex, {
            actions: evt.data.suggestedActions || null,
            cards: doneCards && doneCards.length ? doneCards : null,
          });
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
