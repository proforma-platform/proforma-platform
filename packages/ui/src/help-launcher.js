const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 120);
}

function sanitizeHref(rawHref) {
  const href = String(rawHref ?? "").trim();
  if (!href) return "#";

  if (href.startsWith("/") || href.startsWith("#")) {
    return href;
  }

  try {
    const parsed = new URL(href);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

function normalizeActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const label = sanitizeText(action?.label);
      const href = sanitizeHref(action?.href);
      const external = Boolean(action?.external);
      if (!label || href === "#") return null;
      return { label, href, external };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function ensureRoot(id = "proforma-help-launcher") {
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    document.body.appendChild(root);
  }
  return root;
}

export function initHelpLauncher(inputConfig) {
  if (typeof document === "undefined") return () => {};

  const config = {
    title: sanitizeText(inputConfig?.title || "Ajuda"),
    subtitle: sanitizeText(inputConfig?.subtitle || "Selecione uma opção"),
    actions: normalizeActions(inputConfig?.actions),
  };

  const root = ensureRoot();
  root.innerHTML = "";

  const launcher = document.createElement("div");
  launcher.className = "pf-help-launcher";
  launcher.innerHTML = `
    <button type="button" class="pf-help-toggle" aria-expanded="false" aria-controls="pf-help-panel">
      <span aria-hidden="true">?</span>
      <span>Ajuda</span>
    </button>
    <section id="pf-help-panel" class="pf-help-panel" hidden>
      <header class="pf-help-header">
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
      </header>
      <nav aria-label="Ações de ajuda">
        <ul class="pf-help-list"></ul>
      </nav>
    </section>
  `;

  const button = launcher.querySelector(".pf-help-toggle");
  const panel = launcher.querySelector(".pf-help-panel");
  const list = launcher.querySelector(".pf-help-list");

  if (!button || !panel || !list) return () => {};

  for (const action of config.actions) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "pf-help-link";
    link.textContent = action.label;
    link.href = action.href;
    if (action.external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    item.appendChild(link);
    list.appendChild(item);
  }

  let open = false;
  const setOpen = (value) => {
    open = value;
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) {
      const firstLink = panel.querySelector("a");
      if (firstLink instanceof HTMLElement) firstLink.focus();
    }
  };

  const onButtonClick = () => setOpen(!open);
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      button.focus();
    }
  };

  button.addEventListener("click", onButtonClick);
  document.addEventListener("keydown", onKeyDown);
  root.appendChild(launcher);

  return () => {
    button.removeEventListener("click", onButtonClick);
    document.removeEventListener("keydown", onKeyDown);
    root.innerHTML = "";
  };
}

export function getPublicHelpConfig() {
  return {
    title: "Central de Ajuda",
    subtitle: "Equipe comercial e institucional",
    actions: [
      { label: "Buscar Ajuda", href: "/contato" },
      { label: "Falar com Vendas", href: "mailto:vendas@proforma.local" },
      { label: "Contato", href: "mailto:contato@proforma.local" },
    ],
  };
}

export function getPortalHelpConfig() {
  return {
    title: "Suporte do Portal",
    subtitle: "Atendimento para clientes e parceiros",
    actions: [
      { label: "Buscar KB", href: "/portal/ajuda" },
      { label: "Abrir Ticket", href: "/portal/suporte" },
      { label: "Ouvidoria", href: "/portal/ouvidoria" },
    ],
  };
}
