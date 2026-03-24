import { Driver, Eval, Selection, z } from 'minato';
import init from '@minatojs/sql.js';
import { SQLiteBuilder } from './builder';
export declare class SQLiteDriver extends Driver<SQLiteDriver.Config> {
    static name: string;
    path: string;
    db: init.Database;
    sql: SQLiteBuilder;
    beforeUnload?: () => void;
    private _transactionTask?;
    /** synchronize table schema */
    prepare(table: string, dropKeys?: string[]): Promise<void>;
    start(): Promise<void>;
    _joinKeys(keys?: string[]): string;
    stop(): Promise<void>;
    _exec(sql: string, params: any, callback: (stmt: init.Statement) => any): any;
    _all(sql: string, params?: any, config?: {
        useBigInt: boolean;
    }): any;
    _get(sql: string, params?: any, config?: {
        useBigInt: boolean;
    }): any;
    _export(): Promise<void>;
    _run(sql: string, params?: any, callback?: () => any): any;
    drop(table: string): Promise<void>;
    dropAll(): Promise<void>;
    stats(): Promise<Driver.Stats>;
    remove(sel: Selection.Mutable): Promise<{
        matched?: undefined;
        removed?: undefined;
    } | {
        matched: any;
        removed: any;
    }>;
    get(sel: Selection.Immutable): Promise<any[]>;
    eval(sel: Selection.Immutable, expr: Eval.Expr): Promise<any>;
    _update(sel: Selection.Mutable, indexFields: string[], updateFields: string[], update: {}, data: {}): void;
    set(sel: Selection.Mutable, update: {}): Promise<Driver.WriteResult>;
    _create(table: string, data: {}): any;
    create(sel: Selection.Mutable, data: {}): Promise<any>;
    upsert(sel: Selection.Mutable, data: any[], keys: string[]): Promise<{}>;
    withTransaction(callback: () => Promise<void>): Promise<void>;
    getIndexes(table: string): Promise<Driver.Index<string>[]>;
    createIndex(table: string, index: Driver.Index): Promise<void>;
    dropIndex(table: string, name: string): Promise<void>;
    _parseIndexDef(def: string): {};
}
export declare namespace SQLiteDriver {
    interface Config {
        path: string;
    }
    const Config: z<Config>;
}
export default SQLiteDriver;
