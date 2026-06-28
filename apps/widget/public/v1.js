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
  var legalBaseUrl =
    script.getAttribute("data-legal-base-url") ||
    (scriptUrlParams && scriptUrlParams.get("legal_base_url")) ||
    "https://d3g8dfkodwqrza.cloudfront.net";
  legalBaseUrl = legalBaseUrl.replace(/\/$/, "");
  var demoMode = script.getAttribute("data-demo") === "true";

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
    showDisclaimer: false,
    menuOpen: false,
    copyNotice: "",
    cartNotice: "",
    activeProduct: null,
    activeProductImageIndex: 0,
  };

  function applyDemoConfig() {
    state.config = {
      enabled: true,
      storeName: "CommerceChat",
      greeting: "Hi! How can I help you shop today?",
      suggestedQuestions: [
        "Show best sellers",
        "What's on sale?",
        "Help me choose",
      ],
      primaryColor: "#635bff",
      position: "bottom-right",
    };
    state.primaryColor = state.config.primaryColor;
    state.position = state.config.position;
    state.suggestedQuestions = state.config.suggestedQuestions;
  }

  function activeSuggestedQuestions() {
    if (state.suggestedQuestions && state.suggestedQuestions.length) {
      return state.suggestedQuestions;
    }
    if (state.config && state.config.suggestedQuestions && state.config.suggestedQuestions.length) {
      return state.config.suggestedQuestions;
    }
    return [];
  }

  function chatTranscript() {
    var lines = [];
    state.messages.forEach(function (m) {
      var speaker = m.role === "user" ? "Customer" : "Assistant";
      if (m.text && String(m.text).trim()) {
        lines.push(speaker + ": " + String(m.text).replace(/\s+/g, " ").trim());
      }
      if (m.cards && m.cards.length) {
        m.cards.forEach(function (card) {
          var bits = [card.name || card.sku || "Product"];
          if (card.price) bits.push(formatPrice(card.price, card.currency));
          if (card.sku) bits.push("SKU " + card.sku);
          lines.push("Product: " + bits.join(" | "));
        });
      }
    });
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(area);
    }
    return Promise.resolve();
  }

  function copyChat() {
    var transcript = chatTranscript();
    if (!transcript.trim()) return;
    copyText(transcript)
      .then(function () {
        state.menuOpen = false;
        state.copyNotice = "Chat copied";
        render();
        window.setTimeout(function () {
          if (state.copyNotice === "Chat copied") {
            state.copyNotice = "";
            render();
          }
        }, 1800);
      })
      .catch(function (err) {
        state.menuOpen = false;
        state.copyNotice = "Could not copy chat";
        render();
        console.warn("[CommerceChat] copy chat", err);
      });
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
      ".cc-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.4;color:#0f172a;}" +
      ".cc-bubble{position:fixed;z-index:2147483000;width:62px;height:62px;border-radius:18px;border:1px solid rgba(255,255,255,.28);cursor:pointer;" +
      "box-shadow:0 18px 45px rgba(15,23,42,.24),0 3px 10px rgba(15,23,42,.12);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;pointer-events:auto;transition:transform .18s ease,box-shadow .18s ease;background:linear-gradient(135deg,var(--cc-primary,#4F46E5),#7c3aed);}" +
      ".cc-bubble:hover{transform:translateY(-2px);box-shadow:0 22px 52px rgba(15,23,42,.28),0 5px 14px rgba(15,23,42,.14);}" +
      ".cc-bubble svg{width:32px;height:32px;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.12));}" +
      ".cc-bubble-br{bottom:20px;right:20px}.cc-bubble-bl{bottom:20px;left:20px}" +
      ".cc-panel{position:fixed;z-index:2147483001;width:462px;max-width:calc(100vw - 24px);height:min(720px,calc(100vh - 40px));max-height:calc(100vh - 40px);" +
      "background:#fff;border:1px solid #d5d9e1;border-radius:10px;box-shadow:0 22px 60px rgba(15,23,42,.22),0 6px 18px rgba(15,23,42,.10);display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;}" +
      ".cc-panel-br{top:max(20px,calc((100vh - min(720px,calc(100vh - 40px))) / 2));right:20px}.cc-panel-bl{top:max(20px,calc((100vh - min(720px,calc(100vh - 40px))) / 2));left:20px}" +
      ".cc-header{height:50px;padding:0 12px;color:#111827;font-weight:700;display:grid;grid-template-columns:34px 1fr 34px;align-items:center;flex:0 0 auto;background:#fff;position:relative;}" +
      ".cc-brand{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;grid-column:2}.cc-brand-logo{display:none}.cc-brand-copy{min-width:0;display:flex;align-items:center;gap:8px}.cc-brand-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16px;line-height:1.2;color:#111827}.cc-brand-status{display:none}" +
      ".cc-menu{grid-column:1;width:30px;height:30px;border:none;background:transparent;color:#111827;font-size:22px;line-height:1;cursor:pointer}.cc-menu:before{content:'⋮'}" +
      ".cc-close{grid-column:3;width:30px;height:30px;border:none;background:transparent;color:#374151;font-size:24px;cursor:pointer;line-height:1;opacity:.95}" +
      ".cc-close:hover,.cc-menu:hover{background:#f3f4f6;border-radius:8px}" +
      ".cc-menu-popover{position:absolute;top:46px;left:10px;z-index:2;min-width:160px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 14px 38px rgba(15,23,42,.18);padding:6px;}" +
      ".cc-menu-item{width:100%;border:0;background:#fff;color:#111827;border-radius:9px;padding:10px 12px;text-align:left;font-size:14px;font-weight:700;cursor:pointer}.cc-menu-item:hover{background:#f3f4f6}.cc-menu-item:disabled{opacity:.55;cursor:not-allowed}" +
      ".cc-toast{margin:8px 16px 0;padding:9px 12px;border-radius:10px;background:#ecfdf5;color:#065f46;font-size:13px;font-weight:700;flex:0 0 auto;}" +
      ".cc-gradient-rule{height:3px;flex:0 0 auto;background:linear-gradient(90deg,#d946ef 0%,#8b5cf6 48%,#2dd4bf 100%)}" +
      ".cc-messages{flex:1;min-height:0;overflow-y:auto;padding:14px 18px;background:#fff;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}" +
      ".cc-msg{margin-bottom:10px;max-width:84%;padding:10px 13px;border-radius:10px;word-wrap:break-word;white-space:pre-wrap;font-size:14px;line-height:1.45;}" +
      ".cc-msg-user{margin-left:auto;background:#f0f1f5;color:#111827;border-bottom-right-radius:10px;}" +
      ".cc-msg-bot{background:#fff;border:0;border-bottom-left-radius:10px;line-height:1.45;color:#111827;padding-left:42px;position:relative;}" +
      ".cc-msg-bot:before{content:'✦';position:absolute;left:0;top:8px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--cc-primary,#4F46E5),#7c3aed);font-size:15px;}" +
      ".cc-msg-bot strong{font-weight:600;color:#0f172a;}" +
      ".cc-msg-bot a{color:var(--cc-primary,#4F46E5);}" +
      ".cc-suggestions{padding:0 18px 14px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;border-top:0;background:#fff;flex:0 0 auto;}" +
      ".cc-suggestions-title{font-size:14px;font-weight:700;color:#374151;margin:0 0 2px}.cc-suggestions-subtitle{font-size:13px;font-weight:500;color:#6b7280;margin:-2px 0 4px}" +
      ".cc-chip{font-size:14px;font-weight:500;color:#111827;padding:10px 13px;border-radius:9px;border:1.5px solid #8b5cf6;background:#fff;cursor:pointer;box-shadow:none;text-align:left;max-width:100%;}" +
      ".cc-chip:hover{border-color:var(--cc-primary,#4F46E5);background:#fafaff;}" +
      ".cc-input-row{display:flex;gap:8px;padding:14px max(18px,env(safe-area-inset-right)) 8px max(18px,env(safe-area-inset-left));border-top:1px solid #e5e7eb;background:#fff;flex:0 0 auto;}" +
      ".cc-input-wrap{position:relative;display:flex;flex:1;min-width:0}" +
      ".cc-input{flex:1;min-width:0;border:2px solid #1f2937;border-radius:10px;background:#fff;padding:10px 44px 10px 12px;font-size:15px;line-height:20px;outline:none;-webkit-appearance:none;appearance:none;font-weight:500;}" +
      ".cc-input:focus{border-color:#0f172a;background:#fff;box-shadow:0 0 0 2px rgba(37,99,235,.18);}" +
      ".cc-send{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;border-radius:999px;padding:0;color:#fff;cursor:pointer;font-weight:700;min-height:34px;min-width:34px;width:34px;height:34px;background:#9ca3af;box-shadow:none;font-size:0;}" +
      ".cc-send:before{content:'➜';font-size:18px;line-height:1;}" +
      ".cc-send:disabled{opacity:.5;cursor:not-allowed}" +
      ".cc-disclaimer{padding:0 18px 14px;text-align:center;color:#4b5563;font-size:12px;font-weight:600;background:#fff;flex:0 0 auto}.cc-disclaimer a{color:#2563eb;text-decoration:none}" +
      ".cc-disclaimer-button{appearance:none;background:transparent;border:0;color:#2563eb;font:inherit;font-weight:700;padding:0;cursor:pointer}" +
      ".cc-modal-backdrop{position:fixed;inset:0;z-index:2147483002;background:rgba(17,24,39,.62);display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto;}" +
      ".cc-modal{width:min(560px,calc(100vw - 32px));background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(15,23,42,.35);overflow:hidden;color:#111827;}" +
      ".cc-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 28px 16px}.cc-modal-title{font-size:28px;line-height:1.1;font-weight:800;margin:0}.cc-modal-close{border:0;background:transparent;color:#374151;font-size:38px;line-height:1;cursor:pointer;padding:0 2px}" +
      ".cc-modal-body{padding:14px 28px 28px;font-size:17px;line-height:1.55;color:#1f2937}.cc-modal-body a{color:#2563eb;text-decoration:none;font-weight:700}.cc-modal-footer{border-top:1px solid #e5e7eb;padding:18px 28px 24px;display:flex;justify-content:flex-end}.cc-modal-button{border:0;border-radius:999px;background:#111827;color:#fff;font-size:16px;font-weight:800;padding:12px 28px;cursor:pointer}" +
      ".cc-product-sheet-backdrop{position:fixed;inset:0;z-index:2147483002;background:rgba(15,23,42,.50);display:flex;align-items:flex-end;justify-content:center;padding:18px;pointer-events:auto;}" +
      ".cc-product-sheet{width:min(430px,calc(100vw - 24px));max-height:min(720px,calc(100dvh - 28px));overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(15,23,42,.32);color:#0f172a;}" +
      ".cc-product-sheet-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 8px}.cc-product-sheet-kicker{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b}.cc-product-sheet-close{border:0;background:#f1f5f9;color:#334155;border-radius:999px;width:32px;height:32px;font-size:22px;line-height:1;cursor:pointer;}" +
      ".cc-product-sheet-media{position:relative;margin:0 16px;border-radius:16px;background:linear-gradient(180deg,#f8fafc,#eef2ff);overflow:hidden}.cc-product-sheet-img{width:100%;height:260px;object-fit:contain;display:block}.cc-product-sheet-count{position:absolute;top:10px;right:10px;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;font-size:11px;font-weight:800;padding:4px 8px;}" +
      ".cc-product-sheet-thumbs{display:flex;gap:7px;padding:10px 16px 0;overflow-x:auto}.cc-product-sheet-thumb{flex:0 0 54px;height:48px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:0;overflow:hidden;cursor:pointer}.cc-product-sheet-thumb img{width:100%;height:100%;object-fit:contain;display:block}.cc-product-sheet-thumb-active{border-color:var(--cc-primary,#4F46E5);box-shadow:0 0 0 1px var(--cc-primary,#4F46E5);}" +
      ".cc-product-sheet-body{padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px}.cc-product-sheet-title{margin:0;font-size:19px;line-height:1.2;font-weight:850;color:#0f172a}.cc-product-sheet-meta{display:flex;align-items:center;justify-content:space-between;gap:10px}.cc-product-sheet-price{font-size:17px;font-weight:850}.cc-product-sheet-desc{margin:0;color:#475569;font-size:13px;line-height:1.45}.cc-product-sheet-info{display:flex;flex-wrap:wrap;gap:6px}.cc-product-sheet-pill{border-radius:999px;background:#f1f5f9;color:#334155;font-size:11px;font-weight:750;padding:5px 8px}.cc-product-sheet-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:2px}.cc-product-sheet-actions .cc-product-btn{font-size:13px;padding:10px 11px}.cc-product-sheet-actions .cc-product-btn-wide{grid-column:1/-1;}" +
      ".cc-typing{font-size:12px;color:#64748b;padding:2px 0 6px 42px;}" +
      ".cc-msg-actions{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:-2px 0 10px 42px;max-width:88%;}" +
      ".cc-action-chip{font-size:14px;font-weight:500;color:#111827;padding:10px 13px;border-radius:9px;border:1.5px solid #8b5cf6;background:#fff;cursor:pointer;text-align:left;box-shadow:none;}" +
      ".cc-action-chip:hover{border-color:var(--cc-primary,#4F46E5);background:#fafaff;}" +
      ".cc-product-list{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 8px 0;margin:-2px 0 8px 0;max-width:96%;-webkit-overflow-scrolling:touch;}" +
      ".cc-product-card{flex:0 0 244px;scroll-snap-align:start;display:flex;flex-direction:column;gap:9px;padding:9px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.08);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}" +
      ".cc-product-card:hover{transform:translateY(-1px);border-color:#cbd5e1;box-shadow:0 12px 28px rgba(15,23,42,.11);}" +
      ".cc-product-media{position:relative;border-radius:13px;background:linear-gradient(180deg,#f8fafc,#eef2ff);overflow:hidden;cursor:pointer;}" +
      ".cc-product-img{width:100%;height:146px;border-radius:13px;background:transparent;object-fit:contain;display:block;}" +
      ".cc-product-img-fallback{display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:800;font-size:28px;height:146px;}" +
      ".cc-product-image-count{position:absolute;top:8px;right:8px;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;font-size:10px;font-weight:800;padding:3px 7px;line-height:1;}" +
      ".cc-product-dots{display:none;justify-content:center;gap:4px;margin-top:4px;}" +
      ".cc-product-dot{width:6px;height:6px;border-radius:50%;background:#cbd5e1;border:none;padding:0;}" +
      ".cc-product-dot-active{background:var(--cc-primary,#4F46E5);}" +
      ".cc-product-thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:6px;background:#fff;padding:0;}" +
      ".cc-product-thumb{height:42px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc;padding:0;overflow:hidden;cursor:pointer;position:relative;}" +
      ".cc-product-thumb img{width:100%;height:100%;object-fit:contain;display:block;}" +
      ".cc-product-thumb-active{border-color:var(--cc-primary,#4F46E5);box-shadow:0 0 0 1px var(--cc-primary,#4F46E5);}" +
      ".cc-product-thumb-more{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.54);color:#fff;font-size:11px;font-weight:800;}" +
      ".cc-product-body{min-width:0;display:flex;flex-direction:column;gap:6px;}" +
      ".cc-product-name{font-size:13px;line-height:1.28;font-weight:800;color:#0f172a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px;}" +
      ".cc-product-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:#475569;}" +
      ".cc-product-price{font-weight:800;color:#0f172a;font-size:13px;}" +
      ".cc-product-stock{border-radius:999px;padding:3px 7px;font-size:10px;font-weight:800;background:#ecfdf5;color:#047857;white-space:nowrap;}" +
      ".cc-product-stock-out{background:#fef2f2;color:#b91c1c;}" +
      ".cc-product-desc{font-size:11px;color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35;min-height:30px;}" +
      ".cc-product-buttons{display:grid;grid-template-columns:1.15fr .9fr .9fr;gap:6px;margin-top:2px;}" +
      ".cc-product-btn{font-size:11px;font-weight:800;border-radius:11px;border:1px solid #dbe3ef;background:#fff;padding:8px 7px;cursor:pointer;text-decoration:none;color:#0f172a;text-align:center;line-height:1.1;}" +
      ".cc-product-btn:hover{border-color:#cbd5e1;background:#f8fafc;}" +
      ".cc-product-btn-primary{border-color:var(--cc-primary,#4F46E5);background:var(--cc-primary,#4F46E5);color:#fff;box-shadow:0 6px 14px rgba(79,70,229,.18);}" +
      ".cc-product-btn-primary:hover{background:var(--cc-primary,#4F46E5);color:#fff;filter:brightness(.97);}" +
      ".cc-product-btn:disabled{opacity:.5;cursor:not-allowed;}" +
      "@media (max-width:480px){.cc-bubble-br{bottom:max(16px,env(safe-area-inset-bottom));right:16px}.cc-bubble-bl{bottom:max(16px,env(safe-area-inset-bottom));left:16px}.cc-panel{top:var(--cc-vv-top,0px);left:0;right:0;bottom:auto;width:100vw;max-width:100vw;height:var(--cc-vv-height,100dvh);max-height:var(--cc-vv-height,100dvh);border-radius:0;box-shadow:none}.cc-panel-br,.cc-panel-bl{bottom:auto;right:0;left:0}.cc-header{height:48px;padding-top:max(0px,env(safe-area-inset-top));}.cc-brand-name{font-size:15px}.cc-messages{padding:12px 14px}.cc-msg{max-width:92%;padding:9px 11px;font-size:13px}.cc-msg-bot{padding-left:38px}.cc-msg-bot:before{width:26px;height:26px;font-size:14px}.cc-suggestions{padding:0 14px 12px}.cc-chip{width:100%;font-size:13px;padding:9px 11px}.cc-input-row{position:sticky;bottom:0;padding:12px 14px 8px}.cc-product-list{max-width:100%;gap:8px}.cc-product-card{flex-basis:min(78vw,236px);padding:8px}.cc-product-img,.cc-product-img-fallback{height:128px}.cc-product-thumbs{display:none}.cc-product-dots{display:flex}.cc-product-desc{-webkit-line-clamp:2;}.cc-product-sheet-backdrop{align-items:flex-end;padding:0}.cc-product-sheet{width:100vw;max-height:calc(var(--cc-vv-height,100dvh) - 12px);border-radius:22px 22px 0 0}.cc-product-sheet-img{height:230px}.cc-disclaimer{padding:0 14px max(12px,env(safe-area-inset-bottom));}.cc-modal-backdrop{padding:16px}.cc-modal{border-radius:18px}.cc-modal-header{padding:22px 22px 12px}.cc-modal-title{font-size:24px}.cc-modal-body{padding:12px 22px 24px;font-size:16px}.cc-modal-footer{padding:16px 22px 22px}.cc-modal-button{width:100%;}}" +
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

  function legalUrl(path) {
    return legalBaseUrl + path;
  }

  function renderDisclaimerModal() {
    if (!state.showDisclaimer) return null;
    var backdrop = document.createElement("div");
    backdrop.className = "cc-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "cc-disclaimer-title");

    var modal = document.createElement("div");
    modal.className = "cc-modal";
    modal.innerHTML =
      '<div class="cc-modal-header">' +
      '<h2 id="cc-disclaimer-title" class="cc-modal-title">Disclaimer</h2>' +
      '<button class="cc-modal-close" type="button" aria-label="Close disclaimer">×</button>' +
      "</div>" +
      '<div class="cc-modal-body">' +
      "By chatting, you agree to our " +
      '<a href="' + legalUrl("/legal/site-terms") + '" target="_blank" rel="noopener noreferrer" aria-label="Site Terms">Site Terms</a>, ' +
      '<a href="' + legalUrl("/legal/acceptable-use") + '" target="_blank" rel="noopener noreferrer" aria-label="Acceptable Use Policy">Acceptable Use Policy</a> and ' +
      '<a href="' + legalUrl("/legal/responsible-ai") + '" target="_blank" rel="noopener noreferrer" aria-label="Responsible AI Policy">Responsible AI Policy</a>. ' +
      "Your information is handled as described in our " +
      '<a href="' + legalUrl("/legal/privacy-notice") + '" target="_blank" rel="noopener noreferrer" aria-label="Privacy Notice">Privacy Notice</a>. ' +
      "Inputs you provide and outputs generated through this chatbot may be used to provide, support, and improve the service." +
      "</div>" +
      '<div class="cc-modal-footer"><button class="cc-modal-button" type="button">Close</button></div>';

    function closeModal() {
      state.showDisclaimer = false;
      render();
    }

    modal.querySelector(".cc-modal-close").onclick = closeModal;
    modal.querySelector(".cc-modal-button").onclick = closeModal;
    backdrop.onclick = function (e) {
      if (e.target === backdrop) closeModal();
    };
    backdrop.appendChild(modal);
    return backdrop;
  }

  function productImageUrls(card) {
    if (!card) return [];
    if (card.imageUrls && card.imageUrls.length) return card.imageUrls.slice(0, 8);
    if (card.imageUrl) return [card.imageUrl];
    return [];
  }

  function openProductSheet(card) {
    state.activeProduct = card;
    state.activeProductImageIndex = 0;
    render();
  }

  function closeProductSheet() {
    state.activeProduct = null;
    state.activeProductImageIndex = 0;
    render();
  }

  function renderProductDetailSheet() {
    var card = state.activeProduct;
    if (!card) return null;
    var urls = productImageUrls(card);
    var imageIndex = Math.min(state.activeProductImageIndex || 0, Math.max(urls.length - 1, 0));
    var backdrop = document.createElement("div");
    backdrop.className = "cc-product-sheet-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Product details");

    var sheet = document.createElement("div");
    sheet.className = "cc-product-sheet";

    var header = document.createElement("div");
    header.className = "cc-product-sheet-header";
    var kicker = document.createElement("div");
    kicker.className = "cc-product-sheet-kicker";
    kicker.textContent = "Product details";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "cc-product-sheet-close";
    close.setAttribute("aria-label", "Close product details");
    close.textContent = "×";
    close.onclick = closeProductSheet;
    header.appendChild(kicker);
    header.appendChild(close);
    sheet.appendChild(header);

    var media = document.createElement("div");
    media.className = "cc-product-sheet-media";
    if (urls.length) {
      var img = document.createElement("img");
      img.className = "cc-product-sheet-img";
      img.src = urls[imageIndex];
      img.alt = card.name || card.sku || "Product";
      img.loading = "lazy";
      media.appendChild(img);
      if (urls.length > 1) {
        var count = document.createElement("span");
        count.className = "cc-product-sheet-count";
        count.textContent = imageIndex + 1 + "/" + urls.length;
        media.appendChild(count);
      }
    } else {
      var fallback = document.createElement("div");
      fallback.className = "cc-product-sheet-img cc-product-img-fallback";
      fallback.textContent = (card.name || card.sku || "?").slice(0, 1).toUpperCase();
      media.appendChild(fallback);
    }
    sheet.appendChild(media);

    if (urls.length > 1) {
      var thumbs = document.createElement("div");
      thumbs.className = "cc-product-sheet-thumbs";
      urls.forEach(function (url, idx) {
        var thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "cc-product-sheet-thumb" + (idx === imageIndex ? " cc-product-sheet-thumb-active" : "");
        thumb.setAttribute("aria-label", "Show product image " + (idx + 1));
        var thumbImg = document.createElement("img");
        thumbImg.src = url;
        thumbImg.alt = "";
        thumbImg.loading = "lazy";
        thumb.appendChild(thumbImg);
        thumb.onclick = function () {
          state.activeProductImageIndex = idx;
          render();
        };
        thumbs.appendChild(thumb);
      });
      sheet.appendChild(thumbs);
    }

    var body = document.createElement("div");
    body.className = "cc-product-sheet-body";
    var title = document.createElement("h3");
    title.className = "cc-product-sheet-title";
    title.textContent = card.name || card.sku || "Product";
    body.appendChild(title);

    var meta = document.createElement("div");
    meta.className = "cc-product-sheet-meta";
    var price = document.createElement("span");
    price.className = "cc-product-sheet-price";
    price.textContent = formatPrice(card.price, card.currency);
    meta.appendChild(price);
    var stock = document.createElement("span");
    stock.className = "cc-product-stock" + (card.inStock === false ? " cc-product-stock-out" : "");
    stock.textContent = card.inStock === false ? "Out of stock" : "In stock";
    meta.appendChild(stock);
    body.appendChild(meta);

    if (card.description) {
      var desc = document.createElement("p");
      desc.className = "cc-product-sheet-desc";
      desc.textContent = card.description;
      body.appendChild(desc);
    }

    var info = document.createElement("div");
    info.className = "cc-product-sheet-info";
    [card.sku ? "SKU " + card.sku : "", card.category || "", card.variants ? "Variants: " + card.variants : ""]
      .filter(Boolean)
      .forEach(function (text) {
        var pill = document.createElement("span");
        pill.className = "cc-product-sheet-pill";
        pill.textContent = text;
        info.appendChild(pill);
      });
    if (info.childNodes.length) body.appendChild(info);

    var actions = document.createElement("div");
    actions.className = "cc-product-sheet-actions";
    var add = document.createElement("button");
    add.type = "button";
    add.className = "cc-product-btn cc-product-btn-primary cc-product-btn-wide";
    add.textContent = card.inStock === false ? "Out of stock" : "Add to cart";
    add.disabled = card.inStock === false;
    add.onclick = function () {
      addToCartDirect(card.sku || card.name, 1);
    };
    actions.appendChild(add);

    var similar = document.createElement("button");
    similar.type = "button";
    similar.className = "cc-product-btn";
    similar.textContent = "More like this";
    similar.onclick = function () {
      closeProductSheet();
      sendMessage("Show me more like " + (card.name || card.sku));
    };
    actions.appendChild(similar);

    var view = document.createElement(card.url ? "a" : "button");
    view.className = "cc-product-btn";
    view.textContent = card.url ? "View page" : "Ask details";
    if (card.url) {
      view.href = card.url;
      view.target = "_blank";
      view.rel = "noopener noreferrer";
    } else {
      view.type = "button";
      view.onclick = function () {
        closeProductSheet();
        sendMessage("Tell me more about " + (card.sku || card.name));
      };
    }
    actions.appendChild(view);
    body.appendChild(actions);
    sheet.appendChild(body);

    backdrop.onclick = function (e) {
      if (e.target === backdrop) closeProductSheet();
    };
    backdrop.appendChild(sheet);
    return backdrop;
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
    header.innerHTML =
      '<button class="cc-menu" aria-label="Chat menu" type="button"></button><span class="cc-brand"><span class="cc-brand-logo">' +
      logoSvg(28) +
      '</span><span class="cc-brand-copy"><span class="cc-brand-name">' +
      escapeHtml((state.config && state.config.storeName) || "Chat") +
      '</span></span></span><button class="cc-close" aria-label="Close">−</button>';
    header.querySelector(".cc-menu").onclick = function (e) {
      e.stopPropagation();
      state.menuOpen = !state.menuOpen;
      render();
    };
    header.querySelector(".cc-close").onclick = function () {
      state.menuOpen = false;
      state.open = false;
      render();
    };
    if (state.menuOpen) {
      var menu = document.createElement("div");
      menu.className = "cc-menu-popover";
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "cc-menu-item";
      copy.textContent = "Copy chat";
      copy.disabled = !state.messages.length;
      copy.onclick = function (e) {
        e.stopPropagation();
        copyChat();
      };
      menu.appendChild(copy);
      header.appendChild(menu);
    }
    panel.appendChild(header);

    if (state.copyNotice || state.cartNotice) {
      var toast = document.createElement("div");
      toast.className = "cc-toast";
      toast.textContent = state.copyNotice || state.cartNotice;
      panel.appendChild(toast);
    }

    var rule = document.createElement("div");
    rule.className = "cc-gradient-rule";
    panel.appendChild(rule);

    var messagesEl = document.createElement("div");
    messagesEl.className = "cc-messages";
    state.messages.forEach(function (m, messageIndex) {
      var el = document.createElement("div");
      el.className = "cc-msg " + (m.role === "user" ? "cc-msg-user" : "cc-msg-bot");
      if (m.role === "user") {
        el.textContent = m.text;
      } else {
        el.innerHTML = formatBotText(m.text);
      }
      messagesEl.appendChild(el);
      function appendMessageActions() {
        if (!m.actions || !m.actions.length) return;
        var actions = document.createElement("div");
        actions.className = "cc-msg-actions";
        m.actions.forEach(function (a) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "cc-action-chip";
          chip.textContent = a.label || a.sku;
          chip.onclick = function () {
            if (state.messages[messageIndex]) {
              state.messages[messageIndex].actions = null;
            }
            handleWidgetAction(a);
          };
          actions.appendChild(chip);
        });
        messagesEl.appendChild(actions);
      }
      if (m.cards && m.cards.length) {
        messagesEl.appendChild(renderProductCards(m.cards));
        appendMessageActions();
      } else {
        appendMessageActions();
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
    if (suggestions.length && state.messages.length <= 1) {
      var sug = document.createElement("div");
      sug.className = "cc-suggestions";
      var title = document.createElement("p");
      title.className = "cc-suggestions-title";
      title.textContent = "Want help getting started?";
      sug.appendChild(title);
      var subtitle = document.createElement("p");
      subtitle.className = "cc-suggestions-subtitle";
      subtitle.textContent = "Choose a question or type your own.";
      sug.appendChild(subtitle);
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
    var inputWrap = document.createElement("div");
    inputWrap.className = "cc-input-wrap";
    var input = document.createElement("input");
    input.className = "cc-input";
    input.placeholder = "Ask a question…";
    input.value = state.inputDraft || "";
    input.autocomplete = "off";
    input.setAttribute("enterkeyhint", "send");
    input.setAttribute("aria-label", "Chat message");
    var sendBtn = document.createElement("button");
    sendBtn.className = "cc-send";
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

    inputWrap.appendChild(input);
    inputWrap.appendChild(sendBtn);
    inputRow.appendChild(inputWrap);
    panel.appendChild(inputRow);

    var disclaimer = document.createElement("div");
    disclaimer.className = "cc-disclaimer";
    disclaimer.innerHTML = 'By chatting, you agree to this <button class="cc-disclaimer-button" type="button">disclaimer</button>.';
    disclaimer.querySelector(".cc-disclaimer-button").onclick = function () {
      state.showDisclaimer = true;
      render();
    };
    panel.appendChild(disclaimer);

    container.appendChild(panel);
    var disclaimerModal = renderDisclaimerModal();
    if (disclaimerModal) container.appendChild(disclaimerModal);
    var productSheet = renderProductDetailSheet();
    if (productSheet) container.appendChild(productSheet);

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
      media.onclick = function () {
        openProductSheet(card);
      };
      var urls = [];
      if (card.imageUrls && card.imageUrls.length) urls = card.imageUrls.slice(0, 6);
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
            var imageCount = document.createElement("span");
            imageCount.className = "cc-product-image-count";
            imageCount.textContent = (imageIndex + 1) + "/" + urls.length;
            media.appendChild(imageCount);
          }
          if (urls.length > 1) {
            var thumbs = document.createElement("div");
            thumbs.className = "cc-product-thumbs";
            urls.slice(0, 3).forEach(function (url, idx) {
              var thumb = document.createElement("button");
              thumb.type = "button";
              thumb.className = "cc-product-thumb" + (idx === imageIndex ? " cc-product-thumb-active" : "");
              thumb.setAttribute("aria-label", "Show product image " + (idx + 1));
              var thumbImg = document.createElement("img");
              thumbImg.src = url;
              thumbImg.alt = "";
              thumbImg.loading = "lazy";
              thumb.appendChild(thumbImg);
              if (idx === 2 && urls.length > 3) {
                var more = document.createElement("span");
                more.className = "cc-product-thumb-more";
                more.textContent = "+" + (urls.length - 3);
                thumb.appendChild(more);
              }
              thumb.onclick = function (e) {
                e.stopPropagation();
                imageIndex = idx;
                renderImage();
              };
              thumbs.appendChild(thumb);
            });
            media.appendChild(thumbs);

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
      name.title = card.name || card.sku || "Product";
      body.appendChild(name);

      var meta = document.createElement("div");
      meta.className = "cc-product-meta";
      var price = document.createElement("span");
      price.className = "cc-product-price";
      price.textContent = formatPrice(card.price, card.currency);
      meta.appendChild(price);
      var stock = document.createElement("span");
      stock.className = "cc-product-stock" + (card.inStock === false ? " cc-product-stock-out" : "");
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

      var details = document.createElement("button");
      details.type = "button";
      details.className = "cc-product-btn";
      details.textContent = "Details";
      details.onclick = function () {
        openProductSheet(card);
      };
      buttons.appendChild(details);

      var similar = document.createElement("button");
      similar.type = "button";
      similar.className = "cc-product-btn";
      similar.textContent = "Similar";
      similar.onclick = function () {
        sendMessage("Show me more like " + (card.name || card.sku));
      };
      buttons.appendChild(similar);
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

  function clearMessageActions() {
    state.messages.forEach(function (message) {
      if (message && message.actions) {
        message.actions = null;
      }
    });
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
    clearMessageActions();
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
        state.cartNotice = data.message || "Added to cart";
        addBotMessage(data.message || "Added to your cart.");
        window.setTimeout(function () {
          if (state.cartNotice) {
            state.cartNotice = "";
            render();
          }
        }, 1800);
      })
      .catch(function (err) {
        state.cartNotice = "Could not add to cart";
        addBotMessage("Sorry — " + (err.message || "could not add to cart."));
        console.warn("[CommerceChat] add to cart", err);
        window.setTimeout(function () {
          if (state.cartNotice === "Could not add to cart") {
            state.cartNotice = "";
            render();
          }
        }, 2200);
      })
      .finally(function () {
        state.loading = false;
        render();
      });
  }

  function sendMessage(text) {
    clearMessageActions();
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
    if (demoMode) {
      applyDemoConfig();
      render();
      return;
    }
    var configUrl = apiBase + "/api/v1/widget/config";
    try {
      configUrl += "?pageUrl=" + encodeURIComponent(window.location.href);
    } catch (e) {}
    fetch(configUrl, {
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
        if (demoMode) applyDemoConfig();
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
