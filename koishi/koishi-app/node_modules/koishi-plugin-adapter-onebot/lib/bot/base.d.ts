import { Bot, Context, Schema, Universal } from 'koishi';
import * as OneBot from '../utils';
import { OneBotMessageEncoder } from './message';
export declare class BaseBot<C extends Context = Context, T extends BaseBot.Config = BaseBot.Config> extends Bot<C, T> {
    static MessageEncoder: typeof OneBotMessageEncoder;
    static inject: string[];
    parent?: BaseBot;
    internal: OneBot.Internal;
    createDirectChannel(userId: string): Promise<{
        id: string;
        type: Universal.Channel.Type;
    }>;
    getMessage(channelId: string, messageId: string): Promise<Universal.Message>;
    deleteMessage(channelId: string, messageId: string): Promise<void>;
    getLogin(): Promise<Universal.Login>;
    getUser(userId: string): Promise<Universal.User>;
    getFriendList(): Promise<{
        data: Universal.User[];
    }>;
    handleFriendRequest(messageId: string, approve: boolean, comment?: string): Promise<void>;
    handleGuildRequest(messageId: string, approve: boolean, comment?: string): Promise<void>;
    handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string): Promise<void>;
    deleteFriend(userId: string): Promise<void>;
    getMessageList(channelId: string, before?: string, direction?: Universal.Direction): Promise<{
        data: Universal.Message[];
    }>;
}
export declare namespace BaseBot {
    interface Config {
        advanced?: AdvancedConfig;
    }
    interface AdvancedConfig {
        splitMixedContent?: boolean;
    }
    const AdvancedConfig: Schema<AdvancedConfig>;
}
