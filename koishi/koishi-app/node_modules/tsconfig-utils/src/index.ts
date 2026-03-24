import { CompilerOptions } from 'typescript'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { alias, boolean } from './types.js'
import { fork, ForkOptions } from 'child_process'
import { createRequire } from 'module'
import json5 from 'json5'

export class TsConfig {
  extends?: string
  files?: string[]
  references?: TsConfig.Reference[]
  compilerOptions: CompilerOptions = {}

  constructor(public cwd: string, public args: string[]) {}

  private index(key: string) {
    const names = [key, ...alias[key] || []].map(word => word.length > 1 ? `--${word}` : `-${word}`)
    return this.args.findIndex(arg => names.some(name => arg === name))
  }

  get<K extends keyof CompilerOptions>(key: K): CompilerOptions[K]
  get(key: string, fallback: string): string
  get(key: string, fallback?: any) {
    const index = this.index(key)
    if (index < 0) return fallback ?? this.compilerOptions[key]
    if (boolean.includes(key)) {
      return this.args[index + 1] !== 'false'
    } else {
      return this.args[index + 1]
    }
  }

  set(key: string, value: string, override = true) {
    const index = this.index(key)
    if (index < 0) {
      this.args.push(`--${key}`, value)
    } else if (override) {
      this.args.splice(index + 1, 1, value)
    }
  }
}

export namespace TsConfig {
  export interface Reference {
    path: string
  }
}

export class TsConfigError extends Error {}

export async function read(filename: string) {
  const source = await readFile(filename, 'utf8')
  return json5.parse(source) as TsConfig
}

function makeArray(value: undefined | string | string[]) {
  return Array.isArray(value) ? value : value ? [value] : []
}

export async function load(cwd: string, args: string[] = []) {
  const config = new TsConfig(cwd, args)
  const filename = resolve(cwd, config.get('project', 'tsconfig.json'))
  Object.assign(config, await read(filename))
  const queue = makeArray(config.extends).map(path => createRequire(filename).resolve(path))
  while (queue.length) {
    const filename = queue.pop()!
    const parent = await read(filename)
    config.compilerOptions = {
      ...parent.compilerOptions,
      ...config.compilerOptions,
      types: [
        ...parent.compilerOptions.types ?? [],
        ...config.compilerOptions.types ?? [],
      ],
    }
    queue.push(...makeArray(parent.extends).map(path => createRequire(filename).resolve(path)))
  }
  return config
}

export async function compile(args: string[], options?: ForkOptions) {
  const path = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const child = fork(path, args, { stdio: 'inherit', ...options })
  return new Promise<number>((resolve) => {
    child.on('close', resolve)
  })
}
