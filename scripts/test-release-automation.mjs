import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const deploy=read('.github/workflows/deploy-pages.yml');
const validate=read('.github/workflows/build-standalone.yml');
const packageScript=read('scripts/package-release.py');
const config=JSON.parse(read('app.config.json'));

test('release runs only for merged PR commits after the verified main build',()=>{
  assert.match(deploy,/push:\s*\n\s*branches:\s*\n\s*- main/);
  const release=deploy.slice(deploy.indexOf('\n  release:\n'));
  assert.match(release,/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(release,/needs: build/);
  assert.match(release,/group: pptx-diff-release-main/);
  assert.match(release,/cancel-in-progress: false/);
  assert.match(release,/contents: write/);
  assert.match(release,/pull-requests: read/);
  assert.match(release,/commits\/\$GITHUB_SHA\/pulls/);
  assert.match(release,/\.merged_at != null and \.base\.ref == "main"/);
  assert.match(release,/gh release create "\$TAG"/);
  assert.match(release,/--target "\$GITHUB_SHA"/);
  assert.match(release,/gh release view "\$TAG" --json isDraft/);
  assert.match(release,/gh release edit "\$TAG"/);
  assert.match(release,/--draft=false/);
  assert.match(release,/--notes-file release-assets\/release-notes\.md/);
  assert.match(release,/actions\/download-artifact@v8/);
  assert.match(release,/name: standalone-html-\$\{\{ github\.sha \}\}/);
  assert.match(release,/sha256sum --check SHA256SUMS\.txt/);
  assert.doesNotMatch(deploy.slice(0,deploy.indexOf('\n  release:\n')),/gh release create/);
});

test('ordinary Pages deployment has independent concurrency and cannot cancel the release',()=>{
  assert.match(deploy,/\n  deploy:[\s\S]*?group: github-pages[\s\S]*?cancel-in-progress: true/);
  assert.doesNotMatch(deploy.slice(0,deploy.indexOf('\njobs:')),/cancel-in-progress/);
});

test('PR validation performs a full offline release package dry-run',()=>{
  assert.match(validate,/scripts\/package-release\.py/);
  assert.match(validate,/SHA256SUMS\.txt/);
  assert.match(validate,/actions\/setup-python@v6/);
  assert.match(validate,/\.github\/workflows\/deploy-pages\.yml/);
  assert.match(packageScript,/manifest\["source"\]\["sha256"\]/);
  assert.match(packageScript,/manifest\["output"\]\["sha256"\]/);
  assert.match(packageScript,/ZipFile\(archive,/);
  assert.match(packageScript,/changelog_section\(version\)/);
  assert.match(packageScript,/SHA256SUMS\.txt/);
  assert.match(packageScript,/release-notes\.md/);
  assert.match(config.version,/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
  assert.ok(read('CHANGELOG.md').includes('## '+config.version),'the configured version has changelog notes');
});
