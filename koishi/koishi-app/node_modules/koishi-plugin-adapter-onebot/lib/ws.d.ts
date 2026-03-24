import { Adapter, Context, HTTP, Logger, Schema, Universal } from 'koishi';
import { WebSocketLayer } from '@koishijs/plugin-server';
import { OneBotBot } from './bot';
interface SharedConfig<T = 'ws' | 'ws-reverse'> {
    protocol: T;
    responseTimeout?: number;
}
export declare class WsClient<C extends Context = Context> extends Adapter.WsClient<C, OneBotBot<C, OneBotBot.BaseConfig & WsClient.Options>> {
    accept(socket: Universal.WebSocket): void;
    prepare(): any;
}
export declare namespace WsClient {
    interface Options extends SharedConfig<'ws'>, HTTP.Config, Adapter.WsClientConfig {
    }
    const Options: Schema<Options>;
}
export declare class WsServer<C extends Context> extends Adapter<C, OneBotBot<C, OneBotBot.BaseConfig & WsServer.Options>> {
    static inject: string[];
    logger: Logger;
    wsServer?: WebSocketLayer;
    constructor(ctx: C, bot: OneBotBot<C>);
    disconnect(bot: OneBotBot<C>): Promise<void>;
}
export declare namespace WsServer {
    interface Options extends SharedConfig<'ws-reverse'> {
        path?: string;
    }
    const Options: Schema<Options>;
}
export declare function accept(socket: Universal.WebSocket, bot: OneBotBot<Context, OneBotBot.BaseConfig & SharedConfig>): void;
export {};
