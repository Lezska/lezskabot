import { Context, Schema, Session } from 'koishi';
import { HttpServer } from '../http';
import { WsClient, WsServer } from '../ws';
import { QQGuildBot } from './qqguild';
import { BaseBot } from './base';
export * from './base';
export * from './cqcode';
export * from './message';
export * from './qqguild';
export declare class OneBotBot<C extends Context, T extends OneBotBot.Config = OneBotBot.Config> extends BaseBot<C, T> {
    guildBot: QQGuildBot<C>;
    constructor(ctx: C, config: T);
    stop(): Promise<void>;
    initialize(): Promise<void>;
    setupGuildService(): Promise<void>;
    getChannel(channelId: string): Promise<import("@satorijs/protocol").Channel>;
    getGuild(guildId: string): Promise<import("@satorijs/protocol").Guild>;
    getGuildList(): Promise<{
        data: import("@satorijs/protocol").Guild[];
    }>;
    getChannelList(guildId: string): Promise<{
        data: import("@satorijs/protocol").Channel[];
    }>;
    getGuildMember(guildId: string, userId: string): Promise<import("@satorijs/protocol").GuildMember>;
    getGuildMemberList(guildId: string): Promise<{
        data: import("@satorijs/protocol").GuildMember[];
    }>;
    kickGuildMember(guildId: string, userId: string, permanent?: boolean): Promise<void>;
    muteGuildMember(guildId: string, userId: string, duration: number): Promise<void>;
    muteChannel(channelId: string, guildId?: string, enable?: boolean): Promise<void>;
    checkPermission(name: string, session: Partial<Session>): Promise<boolean>;
}
export declare namespace OneBotBot {
    interface BaseConfig extends BaseBot.Config {
        selfId: string;
        password?: string;
        token?: string;
    }
    const BaseConfig: Schema<BaseConfig>;
    type Config = BaseConfig & (HttpServer.Options | WsServer.Options | WsClient.Options);
    const Config: Schema<Config>;
}
