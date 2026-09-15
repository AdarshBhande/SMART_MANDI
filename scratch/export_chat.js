const fs = require('fs');
const path = require('path');

const logDir = 'C:\\Users\\bhand\\.gemini\\antigravity-ide\\brain\\4a4ea958-cbb9-420a-a57e-0a779131147c\\.system_generated\\logs';
const jsonlFile = fs.existsSync(path.join(logDir, 'transcript_full.jsonl')) 
  ? path.join(logDir, 'transcript_full.jsonl')
  : path.join(logDir, 'transcript.jsonl');

console.log('Reading transcript from:', jsonlFile);

if (!fs.existsSync(jsonlFile)) {
  console.error('File not found:', jsonlFile);
  process.exit(1);
}

const lines = fs.readFileSync(jsonlFile, 'utf8').split('\n').filter(Boolean);
let outputMd = '# Full Conversation Chat History\n\n';
outputMd += `*Exported on: ${new Date().toISOString()}*\n\n---\n\n`;

let userCount = 0;
let modelCount = 0;

for (const line of lines) {
  try {
    const item = JSON.parse(line);
    
    // Check if step represents a User Input
    if (item.type === 'USER_INPUT' || item.source === 'USER_EXPLICIT' || (item.content && item.content.includes('<USER_REQUEST>'))) {
      let text = item.content || '';
      // Clean up XML wrappers if present for better readability
      const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (match) {
        text = match[1].trim();
      }
      if (text.trim()) {
        userCount++;
        outputMd += `## 👤 User (Message #${userCount})\n\n${text.trim()}\n\n---\n\n`;
      }
    } 
    // Check if step represents Model Response
    else if (item.type === 'PLANNER_RESPONSE' || item.source === 'MODEL') {
      let text = '';
      if (item.content) {
        text += item.content.trim() + '\n\n';
      }
      if (item.tool_calls && item.tool_calls.length > 0) {
        text += '**Actions / Tools Executed:**\n';
        for (const tc of item.tool_calls) {
          const action = tc.toolAction || tc.name || tc.toolSummary || 'Tool Execution';
          const summary = tc.toolSummary ? ` — *${tc.toolSummary}*` : '';
          text += `- \`${action}\`${summary}\n`;
        }
        text += '\n';
      }
      if (text.trim()) {
        modelCount++;
        outputMd += `## 🤖 Assistant (Response #${modelCount})\n\n${text.trim()}\n\n---\n\n`;
      }
    }
  } catch (e) {
    // Ignore invalid JSON lines
  }
}

const targetPath = path.join(process.cwd(), 'FULL_CONVERSATION_CHAT_HISTORY.md');
fs.writeFileSync(targetPath, outputMd, 'utf8');
console.log(`SUCCESS: Exported ${userCount} User messages and ${modelCount} Assistant responses to:`);
console.log(targetPath);
console.log(`File Size: ${(fs.statSync(targetPath).size / 1024).toFixed(2)} KB`);
