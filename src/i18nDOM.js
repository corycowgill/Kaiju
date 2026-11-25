// Adapt the legacy HTML and dynamically rendered menus without replacing
// elements, IDs, key bindings, or listeners. Keep original text for live swaps.
const skip = 'script,style,noscript,code,pre,textarea,[translate="no"],[data-l10n-skip],.mn-logo,.tour-brand,.studio b,[data-player-name],.pp-player>b,.pp-show-name,.pp-current,.pp-selection,.wr-k,kbd';
const attributes = ['aria-label', 'aria-description', 'placeholder', 'title'];
export function installLocalizationDOM(locale, doc = document) {
  const originals = new WeakMap(), originalAttrs = new WeakMap();
  let stopped = false;
  function text(node) {
    if (!node.parentElement || node.parentElement.closest(skip) || !node.data.trim()) return;
    let record = originals.get(node);
    if (!record || node.data !== record.rendered) record = { source: node.data, rendered: node.data };
    const rendered = locale.translate(record.source);
    if (node.data !== rendered) node.data = rendered;
    record.rendered = rendered; originals.set(node, record);
  }
  function attrs(element) {
    if (element.closest(skip)) return;
    const records = originalAttrs.get(element) || {};
    for (const name of attributes) {
      const value = element.getAttribute(name); if (value === null) continue;
      let record = records[name];
      if (!record || value !== record.rendered) record = { source: value, rendered: value };
      const rendered = locale.translate(record.source);
      if (rendered !== value) element.setAttribute(name, rendered);
      record.rendered = rendered; records[name] = record;
    }
    originalAttrs.set(element, records);
  }
  function walk(root) {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1 || root.closest(skip)) return;
    attrs(root);
    const walker = doc.createTreeWalker(root, 5); // SHOW_ELEMENT | SHOW_TEXT
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) text(node); else attrs(node);
    }
  }
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    try {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'attributes') attrs(record.target);
        else if (record.type === 'characterData') roots.add(record.target);
        else for (const node of record.addedNodes) roots.add(node);
      }
      for (const root of roots) if (root.isConnected) walk(root);
    } finally { observe(); }
  });
  function observe() { if (!stopped) observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes }); }
  function refresh() {
    observer.disconnect();
    doc.documentElement.lang = locale.getLanguage();
    doc.documentElement.dataset.localized = String(locale.getLanguage() !== 'en');
    try { walk(doc.body); } finally { observe(); }
  }
  const release = locale.subscribe(refresh);
  refresh();
  return { refresh, dispose() { stopped = true; observer.disconnect(); release(); } };
}
