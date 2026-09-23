#!/usr/bin/env node

/**
 * AMT - 多文件版本同步脚本
 *
 * 用法:
 *   npm run bump patch           # 自动自增补丁版本号 (例如 4.7.9 -> 4.7.10)
 *   npm run bump minor           # 自动自增次版本号 (例如 4.7.9 -> 4.8.0)
 *   npm run bump major           # 自动自增主版本号 (例如 4.7.9 -> 5.0.0)
 *   npm run bump 4.8.0           # 指定目标版本号
 *   npm run bump patch --dry-run # 模拟演练模式，仅检查和输出 diff，不实际写磁盘
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 颜色输出辅助
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

function log(msg) {
    console.log(`${colors.cyan}[Bump-Version]${colors.reset} ${msg}`);
}
function success(msg) {
    console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}
function error(msg) {
    console.error(`${colors.red}✗ 错误: ${msg}${colors.reset}`);
}
function warn(msg) {
    console.warn(`${colors.yellow}⚠ 警告: ${msg}${colors.reset}`);
}

// 1. 读取当前根目录 package.json 版本
const pkgPath = path.join(ROOT_DIR, 'package.json');
if (!fs.existsSync(pkgPath)) {
    error('未找到根目录 package.json 文件！');
    process.exit(1);
}

const pkgContent = fs.readFileSync(pkgPath, 'utf8');
const pkgJson = JSON.parse(pkgContent);
const currentVersion = pkgJson.version;

if (!currentVersion || !/^\d+\.\d+\.\d+$/.test(currentVersion)) {
    error(`当前 package.json 中的版本号 "${currentVersion}" 不符合语义化版本 (SemVer X.Y.Z) 规范！`);
    process.exit(1);
}

// 2. 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
for (const arg of args) {
    if (arg.startsWith('--') && arg !== '--dry-run') {
        error(`不支持的参数: ${arg}`);
        process.exit(1);
    }
}
const targetArg = args.find(a => !a.startsWith('--'));

if (!targetArg) {
    console.log(`
${colors.bold}AMT 一键打版版本升级工具${colors.reset}

当前版本: ${colors.green}${currentVersion}${colors.reset}

用法:
  npm run bump patch           # 小版本 +1 (例如 ${currentVersion} -> 自动补丁递增)
  npm run bump minor           # 次版本 +1 (例如 ${currentVersion} -> 自动次版本递增)
  npm run bump major           # 主版本 +1 (例如 ${currentVersion} -> 自动主版本递增)
  npm run bump <新版本号>       # 指定版本号 (必须大于 ${currentVersion})

选项:
  --dry-run                    # 仅演练测试，不实际修改任何文件
`);
    process.exit(0);
}

// 3. 计算新版本号
function parseSemVer(v) {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        return null;
    }
    return { major: parts[0], minor: parts[1], patch: parts[2] };
}

const curSem = parseSemVer(currentVersion);
let nextSem = null;

if (targetArg.toLowerCase() === 'patch') {
    nextSem = { major: curSem.major, minor: curSem.minor, patch: curSem.patch + 1 };
} else if (targetArg.toLowerCase() === 'minor') {
    nextSem = { major: curSem.major, minor: curSem.minor + 1, patch: 0 };
} else if (targetArg.toLowerCase() === 'major') {
    nextSem = { major: curSem.major + 1, minor: 0, patch: 0 };
} else {
    nextSem = parseSemVer(targetArg);
    if (!nextSem) {
        error(`输入的目标版本 "${targetArg}" 格式非法！必须是 SemVer 规范 (例如 4.8.0) 或 patch/minor/major！`);
        process.exit(1);
    }
}

const newVersion = `${nextSem.major}.${nextSem.minor}.${nextSem.patch}`;

// 4. 防呆硬约束：新版本号必须严格大于当前版本号！
function isStrictlyGreater(next, cur) {
    if (next.major > cur.major) return true;
    if (next.major < cur.major) return false;
    if (next.minor > cur.minor) return true;
    if (next.minor < cur.minor) return false;
    return next.patch > cur.patch;
}

if (!isStrictlyGreater(nextSem, curSem)) {
    error(`防呆保护生效：目标版本号 [${newVersion}] 必须严格高于当前版本号 [${currentVersion}]！`);
    error(`发版版本号绝不允许等于或低于现有版本，防止版本回退导致更新检查死锁与混淆。`);
    process.exit(1);
}

log(`启动版本号升级: ${colors.yellow}${currentVersion}${colors.reset} -> ${colors.green}${colors.bold}${newVersion}${colors.reset}${isDryRun ? ' [DRY-RUN 演练模式]' : ''}`);

// 5. 采用本地日期避免时区偏差导致的发版日期倒退
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const TARGET_FILES = [
    {
        name: 'package.json',
        relPath: 'package.json',
        replace: (content) => content.replace(
            `"version": "${currentVersion}"`,
            `"version": "${newVersion}"`
        ),
    },
    {
        name: 'package-lock.json',
        relPath: 'package-lock.json',
        replace: (content) => content
            .replace(`  "version": "${currentVersion}",`, `  "version": "${newVersion}",`)
            .replace(`      "version": "${currentVersion}",`, `      "version": "${newVersion}",`),
    },
    {
        name: 'src-tauri/Cargo.toml',
        relPath: 'src-tauri/Cargo.toml',
        replace: (content) => content.replace(
            `version = "${currentVersion}"`,
            `version = "${newVersion}"`
        ),
    },
    {
        name: 'src-tauri/tauri.conf.json',
        relPath: 'src-tauri/tauri.conf.json',
        replace: (content) => content.replace(
            `"version": "${currentVersion}"`,
            `"version": "${newVersion}"`
        ),
    },
    {
        name: 'src-tauri/Cargo.lock',
        relPath: 'src-tauri/Cargo.lock',
        replace: (content) => content.replace(
            /(\[\[package\]\]\r?\nname = "antigravity-tools"\r?\nversion = )"[^"]+"/,
            `$1"${newVersion}"`
        ),
    },
    {
        name: 'src/pages/Settings.tsx',
        relPath: 'src/pages/Settings.tsx',
        replace: (content) => content.replace(
            `useState<string>('${currentVersion}');`,
            `useState<string>('${newVersion}');`
        ),
    },
    {
        name: 'CHANGELOG.md (自动插入新版本骨架占位)',
        relPath: 'CHANGELOG.md',
        replace: (content) => {
            if (content.includes(`v${newVersion}`)) {
                return content; // 已有则不重复插入
            }
            const anchor = '*   **版本演进**:';
            if (!content.includes(anchor)) {
                return content;
            }
            const eol = content.includes('\r\n') ? '\r\n' : '\n';
            const newBlock = `*   **版本演进**:${eol}    *   **v${newVersion} (${today})**:${eol}        -   **[更新分类] 核心更新标题 (PR #xxx)**:${eol}            -   **功能详述**: 详细说明请在此处补充。${eol}`;
            return content.replace(anchor, newBlock);
        },
    },
    {
        name: 'CHANGELOG_EN.md (自动插入英文版本骨架占位)',
        relPath: 'CHANGELOG_EN.md',
        replace: (content) => {
            if (content.includes(`v${newVersion}`)) {
                return content; // 已有则不重复插入
            }
            const anchor = '*   **Version History**:';
            if (!content.includes(anchor)) {
                return content;
            }
            const eol = content.includes('\r\n') ? '\r\n' : '\n';
            const newBlock = `*   **Version History**:${eol}    *   **v${newVersion} (${today})**:${eol}        -   **[Feature Category] Main Update Summary (PR #xxx)**:${eol}            -   **Description**: Please document update details here.${eol}`;
            return content.replace(anchor, newBlock);
        },
    },
];

// 6. 逐个文件执行安全替换与校验
let updatedCount = 0;

for (const target of TARGET_FILES) {
    const fullPath = path.join(ROOT_DIR, target.relPath);
    if (!fs.existsSync(fullPath)) {
        warn(`未找到目标文件 ${target.relPath}，已自动跳过。`);
        continue;
    }

    const oldContent = fs.readFileSync(fullPath, 'utf8');
    const newContent = target.replace(oldContent);

    if (oldContent === newContent) {
        warn(`文件 ${target.relPath} 内容未发生变更（可能未匹配到版本特征串）。`);
    } else {
        if (!isDryRun) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
        }
        success(`同步更新: ${target.name} -> ${newVersion}`);
        updatedCount++;
    }
}

log(isDryRun
    ? `演练完成：${updatedCount} 处配置需要同步。`
    : `全部 ${updatedCount} 处版本配置已完成同步。请单独运行构建和检查。`);

console.log(`
${colors.bold}${colors.green}${isDryRun ? '演练目标版本' : '版本号已同步到'} v${newVersion}${colors.reset}
请补充变更记录，并在实际产物生成后更新 Cask 的版本与 SHA-256。
`);
