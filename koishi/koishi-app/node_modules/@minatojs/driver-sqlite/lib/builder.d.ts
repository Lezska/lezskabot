import { Builder } from '@minatojs/sql-utils';
import { Dict } from 'cosmokit';
import { Driver, Model, RegExpLike, Type } from 'minato';
export declare class SQLiteBuilder extends Builder {
    protected driver: Driver;
    protected escapeMap: {
        "'": string;
    };
    constructor(driver: Driver, tables?: Dict<Model>);
    escapePrimitive(value: any, type?: Type): string;
    protected createMemberEval(rawKey: any, value: any, notStr?: string): string;
    protected createElementQuery(key: string, value: any): string;
    protected createRegExpQuery(key: string, value: string | RegExpLike): string;
    protected listContains(list: any, value: string): string;
    protected jsonLength(value: string): string;
    protected jsonContains(obj: string, value: string): string;
    protected encode(value: string, encoded: boolean, pure?: boolean, type?: Type): string;
    protected createAggr(expr: any, aggr: (value: string) => string, nonaggr?: (value: string) => string): string;
    protected groupArray(value: string): string;
    protected transformJsonField(obj: string, path: string): string;
}
