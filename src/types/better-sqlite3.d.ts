declare module 'better-sqlite3' {
  interface RunResult { changes: number; lastInsertRowid: number | bigint }
  interface Statement {
    run(...params: any[]): RunResult;
    get<T=any>(...params: any[]): T;
    all<T=any>(...params: any[]): T[];
    iterate<T=any>(...params: any[]): IterableIterator<T>;
    raw(value?: boolean): this;
  }
  interface DatabaseOptions { readonly?: boolean; fileMustExist?: boolean; timeout?: number; verbose?: (...args: any[]) => void }
  interface PragmaOptions { simple?: boolean }
  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare(source: string): Statement;
    transaction(fn: Function): Function;
    pragma(source: string, options?: PragmaOptions): any;
    exec(source: string): Database;
    close(): void;
    defaultSafeIntegers(): this;
  }
  export default Database;
  export { Database };
}
