import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export class McpLogger {
    public static init(channel: vscode.OutputChannel) {
        outputChannel = channel;
    }

    public static log(message: string) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [TODO MCP] ${message}`;
        if (outputChannel) {
            outputChannel.appendLine(formatted);
        }
        // Always write to stderr so stdout is never polluted for stdio JSON-RPC
        console.error(formatted);
    }

    public static toolCall(toolName: string, args: any) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [TOOL CALL >>] ${toolName} args: ${JSON.stringify(args, null, 2)}`;
        if (outputChannel) {
            outputChannel.appendLine(formatted);
        }
        console.error(formatted);
    }

    public static toolResult(toolName: string, result: any, isError: boolean = false) {
        const timestamp = new Date().toISOString();
        const status = isError ? 'FAILED ❌' : 'SUCCESS ✅';
        const formatted = `[${timestamp}] [TOOL RESULT << ${status}] ${toolName}: ${JSON.stringify(result, null, 2)}`;
        if (outputChannel) {
            outputChannel.appendLine(formatted);
        }
        console.error(formatted);
    }

    public static error(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const errDetails = error instanceof Error ? `${error.message}\n${error.stack}` : String(error || '');
        const formatted = `[${timestamp}] [ERROR ❌] ${message} ${errDetails}`;
        if (outputChannel) {
            outputChannel.appendLine(formatted);
        }
        console.error(formatted);
    }

    public static show() {
        if (outputChannel) {
            outputChannel.show(true);
        }
    }
}
