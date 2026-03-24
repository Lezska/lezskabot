import { Context, h, MessageEncoder, Universal } from 'koishi';
import { BaseBot } from './base';
import { CQCode } from './cqcode';
export interface Author extends Universal.User {
    time?: string | number;
    messageId?: string;
}
declare class State {
    type: 'message' | 'forward' | 'reply';
    author: Partial<Author>;
    children: CQCode[];
    constructor(type: 'message' | 'forward' | 'reply');
}
export declare const PRIVATE_PFX = "private:";
export declare class OneBotMessageEncoder<C extends Context = Context> extends MessageEncoder<C, BaseBot<C>> {
    stack: State[];
    children: CQCode[];
    prepare(): Promise<void>;
    forward(): Promise<void>;
    flush(): Promise<void>;
    private sendFile;
    private text;
    visit(element: h): Promise<void>;
}
export {};
