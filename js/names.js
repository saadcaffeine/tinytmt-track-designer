/* Random kart-racing-flavoured track titles (original names, community-inspired). */
(function (root) {
  const flavour = [
    'Banana', 'Shell Shock', 'Rainbow', 'Mushroom', 'Thunder', 'Bullet', 'Coin', 'Turbo', 'Drift',
    'Boost', 'Lightning', 'Starlight', 'Spiny', 'Cocoa', 'Sherbet', 'Biscuit', 'Bonbon', 'Lava',
    'Frosty', 'Cloudtop', 'Sunshine', 'Moonlit', 'Pixel', 'Nitro', 'Wobbly', 'Bouncy', 'Twisty',
    'Jelly', 'Waffle', 'Pudding', 'Cheese Wheel', 'Kiwi', 'Mango', 'Bubblegum', 'Comet', 'Meteor',
    'Bolt', 'Ramp-a-Lamp', 'Curb Cut', 'Big Wheel', 'Tiny Tread', 'Hubcap', 'Spoke', 'Sprocket',
    'Gearbox', 'Rubber Duck', 'Wiggle', 'Zoom Zoom', 'Golden', 'Crystal', 'Neon', 'Dino', 'Sprout'
  ];
  const place = [
    'Meadows', 'Canyon', 'Castle', 'Cove', 'Bay', 'Peaks', 'Lagoon', 'Valley', 'Harbour', 'Jungle',
    'Desert', 'Ruins', 'Galaxy', 'Garden', 'Factory', 'Town', 'Bridge', 'Falls', 'Glacier', 'Volcano',
    'Docks', 'Plaza', 'Alley', 'Boulevard', 'Summit', 'Tundra', 'Wetlands', 'Workshop', 'Kitchen',
    'Rooftops', 'Mine', 'Marsh', 'Orchard', 'Pier', 'Junction', 'Ridge', 'Gardens', 'Skyway'
  ];
  const venue = [
    'Circuit', 'Speedway', 'Raceway', 'Run', 'Rally', 'Grand Prix', 'Loop', 'Cup', 'Gauntlet',
    'Derby', 'Dash', 'Sprint', 'Ring', 'Classic', 'Challenge', 'Scramble', 'Express', 'Showdown'
  ];
  const cups = ['Shell Cup', 'Leaf Cup', 'Star Cup', 'Flower Cup', 'Lightning Cup', 'Special Cup', 'Bolt Cup', 'Sprocket Cup'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function randomTitle() {
    const r = Math.random();
    if (r < 0.45) return `${pick(flavour)} ${pick(place)} ${pick(venue)}`;
    if (r < 0.7) return `${pick(flavour)} ${pick(place)}`;
    if (r < 0.85) return `${pick(place).replace(/s$/, '')} of ${pick(flavour)} ${pick(venue)}`;
    return `${pick(flavour)} ${pick(venue)} — ${pick(cups)}`;
  }
  root.TinyTMTNames = { randomTitle };
})(window);
