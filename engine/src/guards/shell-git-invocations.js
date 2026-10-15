/** @typedef {{ text: string, dynamic: boolean }} ShellWord
 *  @typedef {{ kind: 'subcommand', subcommand: string, args: string[], configKeys: string[], dynamicArgCount: number }
 *         | { kind: 'refused', option: string, rest: string[] }
 *         | { kind: 'indeterminate', rest: string[] }
 *         | { kind: 'no-subcommand' }} GitInvocation */

const SHORT_VALUE_OPTIONS = Object.freeze(['-C', '-c']);
const LONG_VALUE_OPTIONS = Object.freeze([
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--attr-source',
]);
const CONFIG_OPTIONS = Object.freeze(['-c', '--config-env']);
const FLAG_OPTIONS = Object.freeze([
  '--no-pager',
  '-p',
  '--paginate',
  '-P',
  '--no-optional-locks',
  '--literal-pathspecs',
  '--glob-pathspecs',
  '--noglob-pathspecs',
  '--icase-pathspecs',
  '--no-replace-objects',
  '--no-lazy-fetch',
  '--no-advice',
  '--bare',
]);
const EXEC_PATH_PREFIX = '--exec-path=';
const LIST_CMDS_PREFIX = '--list-cmds=';
const PRINT_AND_EXIT_OPTIONS = Object.freeze([
  '--exec-path',
  '--html-path',
  '--man-path',
  '--info-path',
]);
const SUBCOMMAND_ALIASES = Object.freeze({
  '-v': 'version',
  '--version': 'version',
  '-h': 'help',
  '--help': 'help',
});
const ARGS_END = '--';
const OPTION_PREFIX = '-';
const VALUE_SEPARATOR = '=';

const NO_SUBCOMMAND = Object.freeze({ kind: 'no-subcommand' });

const toWord = word => (typeof word === 'string' ? { text: word, dynamic: false } : word);

const configKey = text => text.split(VALUE_SEPARATOR)[0].toLowerCase();

const optionName = text => text.split(VALUE_SEPARATOR)[0];

const texts = words => words.map(word => word.text);

const countDynamic = words => {
  const end = words.findIndex(word => word.text === ARGS_END);
  const counted = end === -1 ? words : words.slice(0, end);
  return counted.filter(word => word.dynamic).length;
};

const isLongValueOption = text => LONG_VALUE_OPTIONS.includes(optionName(text));

const isPrintAndExit = text =>
  PRINT_AND_EXIT_OPTIONS.includes(text) || text.startsWith(LIST_CMDS_PREFIX);

const isSkippedFlag = text => FLAG_OPTIONS.includes(text) || text.startsWith(EXEC_PATH_PREFIX);

const subcommandResult = (text, rest, configKeys) => ({
  kind: 'subcommand',
  subcommand: SUBCOMMAND_ALIASES[text] ?? text,
  args: texts(rest),
  configKeys,
  dynamicArgCount: countDynamic(rest),
});

// Consumes a value-taking option; returns the words left after it, or null when
// the value is missing.
const consumeValueOption = (words, configKeys) => {
  const { text } = words[0];
  const attached = text.includes(VALUE_SEPARATOR) && isLongValueOption(text);
  const value = attached ? text.slice(text.indexOf(VALUE_SEPARATOR) + 1) : words[1]?.text;
  if (value === undefined) return null;
  if (CONFIG_OPTIONS.includes(optionName(text))) configKeys.push(configKey(value));
  return words.slice(attached ? 1 : 2);
};

const isValueOption = text => SHORT_VALUE_OPTIONS.includes(text) || isLongValueOption(text);

export function normaliseGitArgv(words) {
  const configKeys = [];
  let remaining = words.map(toWord);
  while (remaining.length > 0) {
    const [head, ...tail] = remaining;
    const { text } = head;
    if (head.dynamic) return { kind: 'indeterminate', rest: texts(remaining) };
    if (isPrintAndExit(text)) return NO_SUBCOMMAND;
    if (isSkippedFlag(text)) {
      remaining = tail;
      continue;
    }
    if (isValueOption(text)) {
      remaining = consumeValueOption(remaining, configKeys);
      if (remaining === null) return NO_SUBCOMMAND;
      continue;
    }
    if (text.startsWith(OPTION_PREFIX) && !(text in SUBCOMMAND_ALIASES)) {
      return { kind: 'refused', option: text, rest: texts(tail) };
    }
    return subcommandResult(text, tail, configKeys);
  }
  return NO_SUBCOMMAND;
}
