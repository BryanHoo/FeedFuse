// 最低版本与 package.json 的 engines 保持一致，满足 pg-boss 12.13.0 的 Node.js 要求。
const requiredNodeVersion = '22.12.0';

function parseVersion(version) {
  const parts = version.split('.').map((part) => Number(part));
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
  };
}

function isAtLeastVersion(current, required) {
  if (current.major !== required.major) return current.major > required.major;
  if (current.minor !== required.minor) return current.minor >= required.minor;
  return current.patch >= required.patch;
}

const current = parseVersion(process.versions.node);
const required = parseVersion(requiredNodeVersion);

if (!isAtLeastVersion(current, required)) {
  console.error(
    [
      `当前 Node.js 版本为 ${process.versions.node}，不满足本项目要求 (>=${requiredNodeVersion})。`,
      '',
      '请升级 Node.js 后再运行：',
      '- nvm: nvm install && nvm use（按 .nvmrc 使用 Node.js 24）',
      `- pnpm: pnpm env use --global ${requiredNodeVersion}`,
      '',
      '出现 ERR_REQUIRE_ESM（html-encoding-sniffer/@exodus/bytes）通常就是 Node 版本过低导致。',
    ].join('\n'),
  );
  process.exit(1);
}
