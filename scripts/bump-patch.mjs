// Bumps the patch version (x.y.z -> x.y.z+1) in every file that carries it.
// Run by the pre-commit hook so every commit gets a new version. If
// manifest.json is already newer than HEAD's (bumped by hand, e.g. for a minor
// release), that version is kept and copied to the other files.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) =>
	writeFileSync(path, JSON.stringify(data, null, '\t') + '\n');

const parse = (v) => v.split('.').map(Number);
const compare = (a, b) => {
	const [x, y] = [parse(a), parse(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
};

function headVersion() {
	try {
		const manifest = execFileSync('git', ['show', 'HEAD:manifest.json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return JSON.parse(manifest).version;
	} catch {
		return null; // first commit
	}
}

const manifest = readJson('manifest.json');
const head = headVersion();
let version;
if (head && compare(manifest.version, head) > 0) {
	version = manifest.version;
} else {
	const [x, y, z] = parse(head ?? manifest.version);
	version = `${x}.${y}.${z + 1}`;
}

manifest.version = version;
writeJson('manifest.json', manifest);

const pkg = readJson('package.json');
pkg.version = version;
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeJson('package-lock.json', lock);

const versions = readJson('versions.json');
versions[version] = manifest.minAppVersion;
writeJson('versions.json', versions);

console.log(`version bumped ${head ?? '(none)'} -> ${version}`);
