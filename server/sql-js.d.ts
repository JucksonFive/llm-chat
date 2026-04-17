declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: unknown[]): Database
    exec(sql: string): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  export interface Statement {
    bind(params?: unknown[] | Record<string, unknown>): boolean
    step(): boolean
    getAsObject(): Record<string, unknown>
    run(params?: unknown[] | Record<string, unknown>): void
    free(): void
  }

  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
