import { Adapter, Context, HTTP, Schema } from 'koishi';
import { OneBotBot } from './bot';
export declare class HttpServer<C extends Context = Context> extends Adapter<C, OneBotBot<C>> {
    static inject: string[];
    bots: OneBotBot<C>[];
    fork(ctx: C, bot: OneBotBot<C, OneBotBot.Config & HttpServer.Options>): Promise<void>;
    connect(bot: OneBotBot<C, OneBotBot.Config & HttpServer.Options>): Promise<void>;
}
export declare namespace HttpServer {
    interface Options extends HTTP.Config {
        protocol: 'http';
        path?: string;
        secret?: string;
    }
    const Options: Schema<Options>;
}
