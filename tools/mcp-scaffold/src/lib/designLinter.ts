export interface DesignViolation {
  rule: string;
  path: string;
  message: string;
  line?: number;
}

export interface DesignFile {
  path: string;
  content: string;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RGB_RE = /\brgb\s*\(/;
const HSL_RE = /\bhsl\s*\(/;
const NATIVE_INPUT_RE = /<input[\s/>]/i;
const NATIVE_TEXTAREA_RE = /<textarea[\s/>]/i;
const NATIVE_SELECT_RE = /<select[\s/>]/i;

export function lintDesignCompliance(files: DesignFile[]): DesignViolation[] {
  const violations: DesignViolation[] = [];

  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (ext !== 'tsx' && ext !== 'ts' && ext !== 'css') continue;

    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      if (ext === 'css' && line.includes('@import')) continue;

      if (HEX_RE.test(line) || RGB_RE.test(line) || HSL_RE.test(line)) {
        violations.push({
          rule: 'no-hardcoded-color',
          path: file.path,
          line: lineNo,
          message: 'Use design-system tokens (var(--ds-*)) instead of hardcoded colors.',
        });
      }

      if (ext !== 'css') {
        if (NATIVE_INPUT_RE.test(line)) {
          violations.push({
            rule: 'no-native-form-elements',
            path: file.path,
            line: lineNo,
            message: 'Use Input from @wellsfargo-starui/ui instead of native <input>.',
          });
        }
        if (NATIVE_TEXTAREA_RE.test(line)) {
          violations.push({
            rule: 'no-native-form-elements',
            path: file.path,
            line: lineNo,
            message: 'Use Textarea from @wellsfargo-starui/ui instead of native <textarea>.',
          });
        }
        if (NATIVE_SELECT_RE.test(line)) {
          violations.push({
            rule: 'no-native-form-elements',
            path: file.path,
            line: lineNo,
            message: 'Use Select from @wellsfargo-starui/ui instead of native <select>.',
          });
        }
      }
    }

    if (file.path.endsWith('globals.css') || file.path.endsWith('index.css')) {
      if (!file.content.includes("@import '@wellsfargo-starui/design-system/css'")) {
        violations.push({
          rule: 'require-design-system-css-import',
          path: file.path,
          message: "globals.css must @import '@wellsfargo-starui/design-system/css'.",
        });
      }
      if (!file.content.includes("@import '@wellsfargo-starui/grid/styles.css'")) {
        violations.push({
          rule: 'require-grid-css-import',
          path: file.path,
          message: "globals.css must @import '@wellsfargo-starui/grid/styles.css'.",
        });
      }
    }
  }

  return violations;
}

export function lintDirectoryFiles(files: DesignFile[]): DesignViolation[] {
  return lintDesignCompliance(files);
}
