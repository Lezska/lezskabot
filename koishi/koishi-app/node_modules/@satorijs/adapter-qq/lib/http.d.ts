import { Adapter, Context, Schema } from '@satorijs/core';
import { QQBot } from './bot';
export declare class HttpServer<C extends Context = Context> extends Adapter<C, QQBot<C>> {
    static inject: string[];
    connect(bot: QQBot): Promise<void>;
    initialize(bot: QQBot): Promise<void>;
    private getPrivateKey;
    private verify;
}
export declare namespace HttpServer {
    interface Options {
        protocol: 'webhook';
        path: string;
    }
    const Options: Schema<Options>;
}
