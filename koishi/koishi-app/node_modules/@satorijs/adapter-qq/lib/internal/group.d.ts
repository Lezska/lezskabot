import * as QQ from '../types';
declare module './internal' {
    interface GroupInternal {
        sendMessage(channel_id: string, data: QQ.Message.Request): Promise<{
            id: string;
            timestamp: string;
            audit_id?: string;
            audit_tips?: string;
        }>;
        sendPrivateMessage(openid: string, data: QQ.Message.Request): Promise<{
            id: string;
            timestamp: string;
            audit_id?: string;
            audit_tips?: string;
        }>;
        sendFilePrivate(openid: string, data: QQ.Message.File.Request): Promise<any>;
        sendFileGuild(group_openid: string, data: QQ.Message.File.Request): Promise<any>;
        acknowledgeInteraction(interaction_id: string, data: {
            code: number;
        }): Promise<any>;
        getGateway(): Promise<QQ.GetGatewayResponse>;
        getGatewayBot(): Promise<QQ.GetGatewayBotResponse>;
        deleteMessage(openid: string, message_id: string): Promise<any>;
        deletePrivateMessage(userid: string, message_id: string): Promise<any>;
    }
}
