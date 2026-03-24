import * as vite from 'vite';
import { Context } from 'yakumo';
declare module 'yakumo' {
    interface PackageConfig {
        client?: string;
    }
}
export declare function build(root: string, config?: vite.UserConfig): Promise<void>;
export declare function createServer(baseDir: string, config?: vite.InlineConfig): Promise<vite.ViteDevServer>;
export declare const inject: string[];
export declare function apply(ctx: Context): void;
