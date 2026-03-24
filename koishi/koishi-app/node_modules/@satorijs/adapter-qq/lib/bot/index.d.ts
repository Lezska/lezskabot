import { Bot, Context, HTTP, Schema, Universal } from '@satorijs/core';
import { WsClient } from '../ws';
import * as QQ from '../types';
import { QQGuildBot } from './guild';
import { QQMessageEncoder } from '../message';
import { GroupInternal } from '../internal';
import { HttpServer } from '../http';
export declare class QQBot<C extends Context = Context, T extends QQBot.Config = QQBot.Config> extends Bot<C, T> {
    static MessageEncoder: typeof QQMessageEncoder;
    static inject: {
        required: string[];
        optional: string[];
    };
    guildBot: QQGuildBot<C>;
    internal: GroupInternal;
    http: HTTP;
    private _token;
    private _timer;
    constructor(ctx: C, config: T);
    initialize(): Promise<void>;
    stop(): Promise<void>;
    _ensureAccessToken(): Promise<void>;
    getAccessToken(): Promise<string>;
    getLogin(): Promise<Universal.Login>;
    createDirectChannel(id: string): Promise<{
        id: string;
        type: Universal.Channel.Type;
    }>;
    deleteMessage(channelId: string, messageId: string): Promise<void>;
}
export declare namespace QQBot {
    interface BaseConfig extends QQ.Options {
        intents?: number;
        retryWhen: number[];
        manualAcknowledge: boolean;
        protocol: 'websocket' | 'webhook';
        path?: string;
        gatewayUrl?: string;
    }
    type Config = BaseConfig & (HttpServer.Options | WsClient.Options);
    const Config: Schema<Config>;
}
