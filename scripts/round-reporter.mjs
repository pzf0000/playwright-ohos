// Custom playwright reporter that writes per-test and per-suite records
// under the current round directory (PW_OHOS_ROUND_DIR, set by
// scripts/run-round.mjs):
//
//   results/<project>/<file>.log            - one line per test:
//                                             outcome, duration, title and
//                                             skip reasons
//   failures/<project>/<file>#<line>.txt    - full error, steps and
//                                             stdout/stderr of a failed test
//
// Records are appended, so resumed round segments accumulate in the same
// files. Loaded through --reporter with an absolute path computed by
// scripts/run-round.mjs.
import fs from 'node:fs';
import path from 'node:path';

export default class RoundReporter {
  constructor() {
    this._roundDir = process.env.PW_OHOS_ROUND_DIR || null;
    this._projectByTestId = new Map();
  }

  printsToStdio() {
    return false;
  }

  // The custom-reporter wrapper calls onBegin(config, suite): the first
  // argument is the full config, not the suite.
  onBegin(config, suite) {
    if (!this._roundDir) {
      throw new Error('PW_OHOS_ROUND_DIR is not set; run through scripts/run-round.mjs');
    }
    this._rootDir = config.rootDir;
    for (const projectSuite of suite.suites) {
      const projectName = projectSuite.project()?.name || 'unknown';
      for (const test of projectSuite.allTests()) {
        this._projectByTestId.set(test.id, projectName);
      }
    }
  }

  onTestEnd(test, result) {
    const project = this._projectByTestId.get(test.id) || 'unknown';
    const outcome = test.outcome();
    const relativeFile = path.relative(this._rootDir, test.location.file);
    this._appendResult(project, relativeFile, test, result, outcome);
    if (outcome === 'unexpected') {
      this._appendFailure(project, relativeFile, test, result);
    }
  }

  _appendResult(project, relativeFile, test, result, outcome) {
    const reasons = test.annotations
      .filter(annotation => annotation.type === 'skip' || annotation.type === 'fixme')
      .map(annotation => annotation.description || '(未注明原因)')
      .join('; ');
    const line = `${outcome}\t${result.duration}\tL${test.location.line} ${test.title}${reasons ? '\t' + reasons : ''}\n`;
    const file = path.join(this._roundDir, 'results', project, relativeFile + '.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line);
  }

  _appendFailure(project, relativeFile, test, result) {
    const error = result.error;
    const sections = [
      `${project} › ${relativeFile}:${test.location.line}:${test.location.column} › ${test.title}`,
      `Status: ${result.status}`,
      `Duration: ${result.duration}ms`,
      `Timeout: ${test.timeout}ms`,
    ];
    if (error) {
      sections.push('', 'Error:', error.message || '(no message)');
      if (error.stack) {
        sections.push('', 'Stack:', error.stack);
      }
    }
    const steps = (result.steps || [])
      .filter(step => step.category === 'test.step');
    if (steps.length) {
      sections.push('', 'Steps:');
      for (const step of steps) {
        sections.push(`  - ${step.title} (${step.duration}ms)`);
      }
    }
    const stdout = (result.stdout || []).map(String).join('');
    if (stdout) {
      sections.push('', 'Stdout:', stdout);
    }
    const stderr = (result.stderr || []).map(String).join('');
    if (stderr) {
      sections.push('', 'Stderr:', stderr);
    }
    const file = path.join(this._roundDir, 'failures', project, `${relativeFile}#${test.location.line}.txt`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, sections.join('\n') + '\n\n');
  }
}
