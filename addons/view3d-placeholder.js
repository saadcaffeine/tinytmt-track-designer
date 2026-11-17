/*
 * Placeholder for the planned "View in 3D" add-on.
 * Replace this file (or add a new one) with a real viewer, e.g. three.js extruding
 * api.getDerived().pieces[i].outline at each piece's elevation (z / zExit).
 */
TinyTMT.addons.register({
  id: 'view3d',
  label: 'View in 3D',
  icon: '🧊',
  badge: 'Soon',
  run(api) {
    const d = api.getDerived();
    api.modal({
      title: 'View in 3D — coming soon',
      html: `
        <p>A 3D preview is planned as an add-on. The hook is already in place: any script that calls
        <code>TinyTMT.addons.register({...})</code> gets a toolbar button and read access to the design.</p>
        <p>This design currently has <b>${d.pieces.length}</b> pieces, with elevations from
        <b>${Math.round(d.zMin)} mm</b> to <b>${Math.round(d.zMax)} mm</b>.</p>
        <p class="note">See <code>js/addons.js</code> for the API and <code>addons/view3d-placeholder.js</code> for this stub.</p>`,
      buttons: [{ label: 'OK', primary: true }]
    });
  }
});
