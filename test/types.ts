import { spytial, orientation, attribute, atomStyle, diagram, createRegistry } from '../index.js';
class Tree {
  static [spytial] = [orientation('left', ['below', 'left']), attribute('value'), atomStyle({ fillStyle: { color: 'green' } })];
  constructor(public value: number, public left?: Tree) {}
}
const registry = createRegistry().type(Tree, { label: tree => String(tree.value) });
void diagram('#tree', new Tree(8), { registry, spec: [attribute('value')] });
// @ts-expect-error The generated signature must reject unknown directions.
orientation('left', ['down']);
// @ts-expect-error The generated signature must require directions.
orientation({ selector: 'left' });
