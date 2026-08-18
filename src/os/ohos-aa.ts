// ohos-aa support: on HarmonyOS 7.1+ the command starts abilities without
// developer mode. On this machine it is a shell alias, which is resolved
// through the shell.
import { execFileSync } from 'child_process';

import { execFileAsync, resolveCommandPath } from '../utils';

const OHOS_AA_DEFAULT_PATH = '/system/bin/cli_tool/executable/ohos-aa';

const isExecutable = (candidate: string): boolean => {
  try {
    execFileSync(candidate, ['--help'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

let cachedOhosAa: string | undefined | null = null;

/** Resolves the ohos-aa executable, cached for the process lifetime. */
export const resolveOhosAa = (): string | undefined => {
  if (cachedOhosAa !== null) {
    return cachedOhosAa;
  }
  const candidates = [process.env.OHOS_AA_BINARY, resolveCommandPath('ohos-aa'), OHOS_AA_DEFAULT_PATH].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      cachedOhosAa = candidate;
      return candidate;
    }
  }
  cachedOhosAa = undefined;
  return undefined;
};

/** Runs an ohos-aa command. */
export const execOhosAa = async (command: string, args: string[], timeoutMs = 30000) => {
  const { stdout, stderr } = await execFileAsync(command, args, timeoutMs);
  return { stdout, stderr };
};
