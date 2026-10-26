// Fails if any commit in <base>..<head> doesn't increase the manifest version
// over its first parent. Usage: node scripts/check-version-bumps.mjs <base> <head>

import { execFileSync } from 'node:child_process';

const git = (...args) =>
	execFileSync('git', args, { encoding: 'utf8' }).trim();

const versionAt = (rev) => {
	try {
		return JSON.parse(git('show', `${rev}:manifest.json`)).version;
	} catch {
		return null;
	}
};

const parse = (v) => v.split('.').map(Number);
const greater = (a, b) => {
	const [x, y] = [parse(a), parse(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
	return false;
};

const [base, head] = process.argv.slice(2);
const range = /^0+$/.test(base ?? '') || !base ? [`${head}^!`] : [`${base}..${head}`];
const commits = git('rev-list', ...range).split('\n').filter(Boolean);

let failed = false;
for (const commit of commits) {
	const own = versionAt(commit);
	const parent = versionAt(`${commit}^1`);
	const subject = git('log', '-1', '--format=%h %s', commit);
	if (parent && !(own && greater(own, parent))) {
		console.error(`::error::${subject}: version ${own} is not greater than parent ${parent}`);
		failed = true;
	} else {
		console.log(`ok ${subject}: ${parent} -> ${own}`);
	}
}
process.exit(failed ? 1 : 0);
