import {getOption, IOptions} from '@jscpd/core';
import {Entry, sync} from 'fast-glob';
import {getFormatByFile} from '@jscpd/tokenizer';
import { readFileSync, realpathSync } from 'fs-extra';
import {grey} from 'colors/safe';
import {EntryWithContent} from './interfaces';
import {lstatSync, Stats} from "fs";
import bytes = require('bytes');

function isFile(path: string): boolean {
  try {
    const stat: Stats = lstatSync(path);
    return stat.isFile();
  } catch (e) {
    // lstatSync throws an error if path doesn't exist
    return false;
  }
}

function isSymlink(path: string): boolean {
  try {
    const stat: Stats = lstatSync(path);
    return stat.isSymbolicLink();
  } catch (e) {
    // lstatSync throws an error if path doesn't exist
    return false;
  }
}

function skipNotSupportedFormats(options: IOptions): (entry: Entry) => boolean {
  return (entry: Entry): boolean => {
    const {path} = entry;
    const format: string = getFormatByFile(path, options.formatsExts);
    const shouldNotSkip = format && options.format && options.format.includes(format);
    if ((options.debug || options.verbose) && !shouldNotSkip) {
      console.log(`File ${path} skipped! Format "${format}" does not included to supported formats.`);
    }
    return shouldNotSkip;
  }
}

function skipBigFiles(options: IOptions): (entry: Entry) => boolean {
  return (entry: Entry): boolean => {
    const {stats, path} = entry;
    const shouldSkip = bytes.parse(stats.size) > bytes.parse(getOption('maxSize', options));
    if (options.debug && shouldSkip) {
      console.log(`File ${path} skipped! Size more then limit (${bytes(stats.size)} > ${getOption('maxSize', options)})`);
    }
    return !shouldSkip;
  };
}

function skipFilesIfLinesOfContentNotInLimits(options: IOptions): (entry: EntryWithContent) => boolean {
  return (entry: EntryWithContent): boolean => {
    const {path, content} = entry;
    const lines = content.split('\n').length;
    const minLines = getOption('minLines', options);
    const maxLines = getOption('maxLines', options);
    if (lines < minLines || lines > maxLines) {
      if ((options.debug || options.verbose)) {
        console.log(grey(`File ${path} skipped! Code lines=${lines} not in limits (${minLines}:${maxLines})`));
      }
      return false;
    }
    return true;
  }
}

function addContentToEntry(entry: Entry): EntryWithContent {
  const {path} = entry;
  const content = readFileSync(path).toString();
  return {...entry, content}
}

export function getFilesToDetect(options: IOptions): EntryWithContent[] {
  const pattern = options.pattern || '**/*';
  let path = options.path;

  if (options.noSymlinks) {
    path = path.filter((path: string) => !isSymlink(path));
  }

  const patternArr = pattern.split(',')

  const pathArr: string[] = path.reduce((acc, cur) => {
    const currentPath = realpathSync(cur)

    if (isFile(currentPath)) {
      acc.push(currentPath)
    }

    patternArr.forEach((patt) => {
      acc.push(cur.endsWith('/') ? `${path}${patt}` : `${path}/${patt}`)
    })

    return acc
  }, [])

  return sync(
    pathArr,
    {
      ignore: options.ignore,
      onlyFiles: true,
      dot: true,
      stats: true,
      absolute: options.absolute,
      followSymbolicLinks: !options.noSymlinks,
    },
  )
    .filter(skipNotSupportedFormats(options))
    .filter(skipBigFiles(options))
    .map(addContentToEntry)
    .filter(skipFilesIfLinesOfContentNotInLimits(options));
}

