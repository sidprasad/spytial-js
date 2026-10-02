import {
  spytial, attribute, hideAtom, inferredEdge, orientation, atomStyle, createRegistry,
} from '../../index.js';

export const REGIONS = ['WA', 'NT', 'SA', 'Q', 'NSW', 'V', 'T'];
// Each undirected border occurs once. Indices match MiniZinc's one-based arrays.
export const BORDERS = [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [3, 5], [3, 6], [4, 5], [5, 6]];
export const PALETTE = [
  { name: 'Coral', color: '#ffd2c7' },
  { name: 'Blue', color: '#c7e5ff' },
  { name: 'Gold', color: '#ffe6a0' },
  { name: 'Green', color: '#c9edcd' },
];

export class Region {
  static [spytial] = [attribute('color')];
  constructor(name) { this.name = name; this.color = 'Unassigned'; this.adjacent = []; }
}

export class Coloring {
  static [spytial] = [
    // Keep the full JS structure in the snapshot, but draw only the domain graph.
    hideAtom('Coloring + JSArray + JSSlot'),
    inferredEdge('border', 'adjacent.item.value'),
    orientation('Coloring.WA -> Coloring.NT', ['above', 'right']),
    orientation('Coloring.WA -> Coloring.SA', ['below', 'right']),
    orientation('Coloring.NT -> Coloring.Q', ['right']),
    orientation('Coloring.SA -> Coloring.NSW', ['right']),
    orientation('Coloring.Q -> Coloring.NSW', ['below']),
    orientation('Coloring.NSW -> Coloring.V', ['below']),
  ];
  constructor() {
    for (const name of REGIONS) this[name] = new Region(name);
    for (const [a, b] of BORDERS) this[REGIONS[a - 1]].adjacent.push(this[REGIONS[b - 1]]);
  }
}

export const registry = createRegistry().type(Region, {
  label: region => region.name,
  fields: region => ({ color: region.color, adjacent: region.adjacent }),
});

export function modelData(nColors) {
  if (![2, 3, 4].includes(nColors)) throw new RangeError('Choose 2, 3, or 4 colors.');
  return {
    n_colors: nColors, n_regions: REGIONS.length, n_borders: BORDERS.length,
    from_region: BORDERS.map(([a]) => a), to_region: BORDERS.map(([, b]) => b),
  };
}

export function validateSolution(colors, nColors) {
  modelData(nColors);
  if (!Array.isArray(colors) || colors.length !== REGIONS.length ||
      !colors.every(c => Number.isInteger(c) && c >= 1 && c <= nColors) ||
      colors[0] !== 1 || colors[6] !== 1 ||
      BORDERS.some(([a, b]) => colors[a - 1] === colors[b - 1])) {
    throw new Error('MiniZinc returned an invalid coloring.');
  }
  return [...colors];
}

export function applySolution(graph, colors, nColors) {
  const checked = validateSolution(colors, nColors);
  for (const [i, name] of REGIONS.entries()) graph[name].color = PALETTE[checked[i] - 1].name;
  return PALETTE.flatMap((swatch, i) => {
    const names = REGIONS.filter((_, j) => checked[j] === i + 1);
    return names.length ? [atomStyle({
      selector: names.map(name => `Coloring.${name}`).join(' + '),
      fillStyle: { color: swatch.color },
    })] : [];
  });
}
