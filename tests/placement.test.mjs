import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

function moduleUrl(file, imports = {}) {
	const source = readFileSync(new URL(file, import.meta.url), 'utf8');
	let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
	for (const [name, url] of Object.entries(imports)) compiled = compiled.replaceAll(`'${name}'`, `'${url}'`);
	return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
}
const routing = moduleUrl('../src/features/grid-map/utils/dijkstra.ts');
const layout = moduleUrl('../src/features/grid-map/utils/warehouseLayout.ts', { './dijkstra': routing });
const placement = moduleUrl('../src/features/grid-map/utils/placement.ts', { './dijkstra': routing, './warehouseLayout': layout });
const { suggestPlacements } = await import(placement);
const { storageSlots } = await import(layout);
const parcel = (storage_location, quantity) => ({ storage_location, quantity });

let results = suggestPlacements([parcel('Rack A-01', 60), parcel('A-01', 20), parcel('A-02', 50)], 15, 100, 'rack');
assert.equal(results[0].slot.location, 'A-01');
assert.equal(results[0].remaining, 5);
assert.ok(results.every(item => item.used + 15 <= 100));
results = suggestPlacements([parcel('A-01', 100)], 10, 100, 'rack');
assert.ok(results.length > 0);
assert.ok(results.every(item => item.slot.location !== 'A-01'));
assert.ok(suggestPlacements([], 20, 100, 'cold').every(item => item.slot.kind === 'cold'));
assert.deepEqual(suggestPlacements([], 101, 100, 'rack'), []);
assert.deepEqual(suggestPlacements([], 0, 100, 'rack'), []);
assert.deepEqual(suggestPlacements([], 1.5, 100, 'rack'), []);
assert.deepEqual(suggestPlacements([], 1, 0, 'rack'), []);
assert.deepEqual(suggestPlacements(storageSlots.map(slot => parcel(slot.location, 100)), 1, 100, 'rack'), []);
// Filling the last opening in a full-height wall would cut IN off from OUT.
const wall = storageSlots.filter(slot => slot.point.column === 6 && slot.point.row !== 9).map(slot => parcel(slot.location, 100));
assert.ok(!suggestPlacements(wall, 100, 100, 'rack').some(item => item.slot.point.column === 6 && item.slot.point.row === 9));
assert.ok(suggestPlacements([], 100, 100, 'rack').length > 0);
console.log('Placement checks passed: best fit, combined loads, capacity, storage types, invalid inputs, full warehouse, and aisle preservation.');
