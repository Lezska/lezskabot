import { Adapter, Context, Schema } from '@satorijs/core';
import { QQBot } from './bot';
export declare class WsClient<C extends Context = Context> extends Adapter.WsClient<C, QQBot<C, QQBot.Config & WsClient.Options>> {
    _sessionId: string;
    _s: number;
    _ping: NodeJS.Timeout;
    _acked: boolean;
    prepare(): Promise<WebSocket>;
    heartbeat(): void;
    accept(): Promise<void>;
}
export declare namespace WsClient {
    interface Options extends Adapter.WsClientConfig {
        protocol?: 'websocket';
    }
    const Options: Schema<Options>;
}
