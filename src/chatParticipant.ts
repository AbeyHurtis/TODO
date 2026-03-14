import * as vscode from 'vscode';
import { TodoViewProvider } from './TodoViewProvider';

export function registerChatParticipant(context: vscode.ExtensionContext, provider: TodoViewProvider) {
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        response.progress('Processing task tracker request...');

        const userPrompt = request.prompt;
        
        // System instructions to minimize tokens and extract intent efficiently
        const systemPrompt = `You parse task tracker requests. Extract a concise title and one category from: TODO, Active, Backlog, Completed, Blocked. Reply ONLY with JSON: {"title": "Task title", "category": "Category"}. If intent is ambiguous or you can't infer a task, reply {"error": "..."}.`;

        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(userPrompt)
        ];

        let title = '';
        let category = 'TODO';
        let error = '';

        try {
            // Pick the first available chat model
            const models = await vscode.lm.selectChatModels({});
            if (models.length > 0) {
                const chatModel = models[0];
                
                response.progress(`Generating with ${chatModel.name}...`);
                
                const chatResponse = await chatModel.sendRequest(messages, {}, token);
                let jsonResponse = '';
                
                for await (const chunk of chatResponse.text) {
                    jsonResponse += chunk;
                }

                // Clean markdown code blocks if the model wrapped the JSON
                jsonResponse = jsonResponse.replace(/\`\`\`json/gi, '').replace(/\`\`\`/gi, '').trim();
                
                const parsed = JSON.parse(jsonResponse);
                if (parsed.error) {
                    error = parsed.error;
                } else {
                    title = parsed.title;
                    if (parsed.category) category = parsed.category;
                }
            } else {
                // Fallback to basic keyword parser if no LLM is enabled or found
                response.progress('No chat model found, falling back to basic parser...');
                
                const lowerPrompt = userPrompt.toLowerCase();
                if (lowerPrompt.includes('block') || lowerPrompt.includes('fail') || lowerPrompt.includes('stuck')) {
                    category = 'Blocked';
                }
                const titleMatch = userPrompt.match(/(?:add|create) (?:task|todo|blocked task) (?:for|to) (.+)/i);
                title = titleMatch ? titleMatch[1] : userPrompt.replace(/@todotracker/gi, '').trim();
            }
        } catch (e) {
            console.error(e);
            error = 'Failed to parse request with LLM. Ensure you are signed into an LLM provider in your editor or try a simpler prompt.';
        }

        if (error) {
            response.markdown(error);
        } else if (title) {
            provider.addTask(title, null, category);
            response.markdown(`Added task: **${title}** to **${category}**`);
        } else {
            response.markdown(`I couldn't quite understand the task title. Try saying something like: \`@todotracker add task to fix the auth issue\`.`);
        }
    };

    try {
        const participant = vscode.chat.createChatParticipant('local-dev.TODO.todotracker', handler);
        participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'todo.svg');

        context.subscriptions.push(participant);
    } catch (e) {
        console.error('Failed to register chat participant:', e);
        vscode.window.showErrorMessage('Failed to register @todotracker chat participant. See console for details.');
    }
}
