import { Context, Universal } from 'koishi';
import { BaseBot } from './base';
import { OneBotBot } from '.';
import * as OneBot from '../utils';
export declare namespace QQGuildBot {
    interface Config extends BaseBot.Config {
        parent: OneBotBot<Context>;
        profile: OneBot.GuildServiceProfile;
    }
}
export declare class QQGuildBot<C extends Context> extends BaseBot<C> {
    parent: OneBotBot<Context>;
    hidden: boolean;
    constructor(ctx: C, config: QQGuildBot.Config);
    get status(): Universal.Status;
    set status(status: Universal.Status);
    start(): Promise<void>;
    stop(): Promise<void>;
    getChannel(channelId: string, guildId?: string): Promise<Universal.Channel>;
    getChannelList(guildId: string): Promise<{
        data: Universal.Channel[];
    }>;
    getGuild(guildId: string): Promise<Universal.Guild>;
    getGuildList(): Promise<{
        data: Universal.Guild[];
    }>;
    getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember>;
    getGuildMemberList(guildId: string): Promise<{
        data: Universal.GuildMember[];
    }>;
}
