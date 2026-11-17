/*
 * TinyTMT add-on registry.
 *
 * An add-on is a plain script loaded after app.js that calls:
 *
 *   TinyTMT.addons.register({
 *     id: 'view3d',
 *     label: 'View in 3D',
 *     icon: '🧊',                 // optional
 *     badge: 'Soon',              // optional pill on the toolbar button
 *     run(api) { ... }            // called when the button is clicked
 *     init(api) { ... }           // optional, called once on registration
 *   });
 *
 * `api` (also available as TinyTMT.api) exposes read-only helpers:
 *   api.getDesign()    → deep copy of the current design JSON
 *   api.getDerived()   → computed geometry: pieces with world outlines, connectors, stats, BoM
 *   api.getParts()     → the active parts catalogue
 *   api.getSettings()  → current settings
 *   api.geom           → geometry helpers (TinyTMTGeom)
 *   api.on('change', fn) → subscribe to design changes; returns an unsubscribe fn
 *   api.modal({title, html, buttons}) / api.toast(msg)
 */
(function (root) {
  const list = [];
  const listeners = {};
  const TinyTMT = root.TinyTMT || (root.TinyTMT = {});
  TinyTMT.version = '1.0.0';
  TinyTMT._emit = (ev, data) => (listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error('[TinyTMT add-on]', e); } });
  TinyTMT._on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; };
  TinyTMT.addons = {
    list,
    register(addon) {
      if (!addon || !addon.id || typeof addon.run !== 'function') throw new Error('Add-on needs an id and a run(api) function');
      if (list.some((a) => a.id === addon.id)) return;
      list.push(addon);
      TinyTMT._emit('addon-registered', addon);
      if (TinyTMT.api && typeof addon.init === 'function') addon.init(TinyTMT.api);
    }
  };
})(window);
