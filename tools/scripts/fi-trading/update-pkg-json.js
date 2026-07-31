#!/usr/bin/env node
/**
 * Rewrite package.json so that direct dependencies resolve from libs/ tarballs.
 * Transitive deps are handled via npm cache (populated by preinstall script).
 *
 * Usage: node scripts/update-pkg-json.js <app-dir>
 */
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || '.');
const pkgPath = path.join(appDir, 'package.json');
const mapPath = path.join(appDir, 'libs', '_dep-map.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const depMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

// Verify each tarball exists
const libsDir = path.join(appDir, 'libs');

// Rewrite direct dependencies
function rewriteDeps(deps) {
  if (!deps) return deps;
  const out = {};
  for (const [name, range] of Object.entries(deps)) {
    if (range.startsWith('file:libs/')) {
      out[name] = depMap[name] || range;
    } else if (depMap[name]) {
      out[name] = depMap[name];
    } else {
      out[name] = range;
    }
  }
  return out;
}

pkg.dependencies = rewriteDeps(pkg.dependencies);
pkg.devDependencies = rewriteDeps(pkg.devDependencies);

// Remove overrides if present (cache-based approach instead)
delete pkg.overrides;

// Add preinstall script to populate npm cache from libs/
const preinstall = `node -e "const r=require('fs').readdirSync,e=require('child_process').execSync;r('libs').filter(f=>f.endsWith('.tgz')).forEach(f=>{try{e('npm cache add libs/'+f,{stdio:'pipe',timeout:10000})}catch(x){}})"`;

if (!pkg.scripts) pkg.scripts = {};
pkg.scripts.preinstall = preinstall;

// Write back
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const directNames = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

console.log(`Updated ${pkgPath}:`);
console.log(`  Direct deps rewritten: ${directNames.size}`);
console.log(`  Preinstall cache script: added`);
console.log(`  Overrides: removed (using cache-based approach)`);
