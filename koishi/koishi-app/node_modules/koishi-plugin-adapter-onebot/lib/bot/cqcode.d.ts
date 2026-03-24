import { Dict, h } from 'koishi';
export declare function CQCode(type: string, attrs: Dict<string>): string;
export interface CQCode {
    type: string;
    data: Dict<string>;
    capture?: RegExpExecArray;
}
export declare namespace CQCode {
    function escape(source: any, inline?: boolean): string;
    function unescape(source: string): string;
    function from(source: string): CQCode;
    function parse(source: string | CQCode[]): h[];
}
