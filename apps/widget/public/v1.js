/**
 * CommerceChat embeddable widget v1 (vanilla JS, no dependencies).
 * Usage: <script src="https://api.example.com/widget/v1.js" data-api-key="pk_live_..." async></script>
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }

  var apiKey = script.getAttribute("data-api-key");
  if (!apiKey || !apiKey.startsWith("pk_live_")) {
    console.warn("[CommerceChat] Missing or invalid data-api-key");
    return;
  }

  var apiBase = script.getAttribute("data-api-url");
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

  var root = document.createElement("div");
  root.id = "commercechat-widget";
  root.setAttribute("data-cc-root", "1");
  var shadow = root.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = getStyles();
  shadow.appendChild(style);

  var container = document.createElement("div");
  container.className = "cc-root";
  shadow.appendChild(container);

  document.body.appendChild(root);

  function getStyles() {
    return (
      ".cc-root{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.4;}" +
      ".cc-bubble{position:fixed;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;}" +
      ".cc-bubble-br{bottom:20px;right:20px}.cc-bubble-bl{bottom:20px;left:20px}" +
      ".cc-panel{position:fixed;z-index:2147483001;width:380px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 100px);" +
      "background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;}" +
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
      ".cc-action-chip:hover{border-color:var(--cc-primary,#4F46E5);color:var(--cc-primary,#4F46E5);}"
    );
  }

  function posClass(prefix) {
    return state.position === "bottom-left" ? prefix + "-bl" : prefix + "-br";
  }

  function render() {
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

  function addUserMessage(text) {
    state.messages.push({ role: "user", text: text });
    render();
  }

  function addBotMessage(text, actions) {
    state.messages.push({ role: "bot", text: text, actions: actions || null });
    render();
  }

  function sendMessage(text) {
    addUserMessage(text);
    state.loading = true;
    render();

    fetch(apiBase + "/api/v1/widget/chat", {
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
        if (reply) addBotMessage(reply, actions);
        else addBotMessage("Sorry, I could not respond right now.");
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

  fetch(apiBase + "/api/v1/widget/config", {
    headers: { "X-API-Key": apiKey },
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (json) {
      if (json.success && json.data) {
        state.config = json.data;
        state.primaryColor = json.data.primaryColor || state.primaryColor;
        state.position = json.data.position || state.position;
      }
      render();
    })
    .catch(function () {
      render();
    });
})();
