// ohos-aa support: on HarmonyOS 7.1+ the command starts abilities without
// developer mode. On this machine it is a shell alias, which is resolved
// through the shell.
import { execFileSync } from 'child_process';

import { execFileAsync } from '../utils';

const OHOS_AA_DEFAULT_PATH = '/system/bin/cli_tool/executable/ohos-aa';

const isExecutable = (candidate: string): boolean => {
  try {
    execFileSync(candidate, ['--help'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

/** Resolves the ohos-aa executable. */
export const resolveOhosAa = (): string | undefined => {
  const candidates = [process.env.OHOS_AA_BINARY, 'ohos-aa', OHOS_AA_DEFAULT_PATH].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  for (const shell of ['zsh', 'bash', 'sh']) {
    try {
      const out = execFileSync(shell, ['-ic', 'which ohos-aa 2>/dev/null || true'], { encoding: 'utf8', timeout: 8000 }).trim();
      const match = out.match(/aliased to (\S+)/) || out.match(/^(\S+)$/m);
      if (match && isExecutable(match[1])) {
        return match[1];
      }
    } catch {
    }
  }
  return undefined;
};

/** Runs an ohos-aa command. */
export const execOhosAa = async (command: string, args: string[], timeoutMs = 30000) => {
  const { stdout, stderr } = await execFileAsync(command, args, timeoutMs);
  return { stdout, stderr };
};
