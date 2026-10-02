import { spytial, orientation, attribute, atomStyle, diagram, createRegistry, loadCore } from '../index.js';

class TreeNode {
  static [spytial] = [
    orientation('left', ['below', 'left']),
    orientation('right', ['below', 'right']),
    attribute('value'),
    atomStyle({ selector: 'TreeNode', fillStyle: { color: '#e6f1e9' } }),
  ];

  constructor(value, left, right) {
    this.value = value;
    if (left) this.left = left;
    if (right) this.right = right;
  }
}
const registry = createRegistry();
const root = new TreeNode(8, new TreeNode(3, new TreeNode(1), new TreeNode(6)), new TreeNode(10, null, new TreeNode(14)));
const stock = { count: 4 };
const dictionary = { 'in stock': stock, featured: stock, warehouse: { count: 12 } };
registry.value(dictionary, { kind: 'dictionary', label: () => 'Inventory' });
const shared = { title: 'shared' };
const array = [shared, shared, , undefined];
shared.back = array;
const collection = new Map([[shared, array], ['enabled', new Set([true, false])]]);

try {
  // Local verification uses an explicitly served core asset, without changing the CDN default.
  const local = new URL(location.href).searchParams.get('core') === 'local';
  const core = await loadCore(local ? { coreUrl: '/spytial-core/dist/browser/spytial-core-complete.global.js' } : {});
  const treeView = await diagram('#tree', root, { core, height: 480 });
  const dictionaryView = await diagram('#dictionary', dictionary, {
    registry, core, height: 480,
    spec: { constraints: [{ orientation: { selector: 'entry', directions: ['below'] } }] },
  });
  const collectionView = await diagram('#collections', collection, { core, height: 440 });
  const status = document.querySelector('#status');
  status.textContent = 'Ready. Drag nodes to explore; use the buttons to change the underlying JavaScript values.';
  const insert = document.querySelector('#insert');
  insert.disabled = false;
  insert.onclick = async () => {
    insert.disabled = true;
    root.left.right.left = new TreeNode(5);
    try { await treeView.update(); insert.textContent = 'Inserted 5'; } catch (error) { status.textContent = error.message; }
  };
  const change = document.querySelector('#change');
  change.disabled = false;
  change.onclick = async () => {
    change.disabled = true;
    stock.count += 1;
    try { await dictionaryView.update(); } catch (error) { status.textContent = error.message; }
    finally { change.disabled = false; }
  };
  document.querySelector('#payload').textContent = JSON.stringify(collectionView.snapshot.data, null, 2);
  // Inspection seam for the demo and the real-browser smoke test.
  window.demo = { treeView, dictionaryView, collectionView, root, stock };
} catch (error) {
  document.querySelector('#status').textContent = error.message;
  console.error(error);
}
