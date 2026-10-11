const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const root = path.join(project, 'miniprogram');
const compiler = require.resolve('typescript/bin/tsc');
// 使用项目锁定的 TypeScript 编译全部运行时代码，测试不进入微信代码包。
// 必须同时生成页面和服务依赖；只补一个 index.js 仍会在 require 服务模块时失败。
const result = spawnSync(process.execPath, [compiler, '-p', path.join(project, 'tsconfig.runtime.json')], { stdio: 'inherit', cwd: project });
if (result.error) { console.error('小程序构建失败：' + result.error.message); process.exit(1); }
if (result.status !== 0) process.exit(result.status ?? 1);

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pages = [...app.pages, ...(app.subpackages ?? app.subPackages ?? []).flatMap((group) => group.pages.map((page) => group.root + '/' + page))];
const files = ['app.js', 'app.json', ...pages.flatMap((page) => ['js', 'json', 'wxml', 'wxss'].map((extension) => page + '.' + extension))];
const missing = files.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) { console.error('小程序构建失败，缺少文件：\n' + missing.join('\n')); process.exit(1); }
// 检查相对 require 的闭包，防止上传时页面存在但运行依赖漏编译。
const visited = new Set();
function check(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
    const base = path.resolve(path.dirname(file), match[1]);
    const dependency = [base + '.js', path.join(base, 'index.js')].find((candidate) => fs.existsSync(candidate));
    if (!dependency) throw new Error('缺少依赖：' + match[1] + '，来源：' + path.relative(root, file));
    check(dependency);
  }
}
try { for (const file of ['app.js', ...pages.map((page) => page + '.js')]) check(path.join(root, file)); }
catch (error) { console.error('小程序构建失败：' + error.message); process.exit(1); }
console.log('小程序构建成功：' + pages.length + ' 个页面，' + visited.size + ' 个运行模块完整。');
